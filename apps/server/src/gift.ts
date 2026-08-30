import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { GIFT } from '@tmw/shared';
import { db } from './db/index';
import { channelActivity, dustGifts, linkedIdentities, pendingDust, users } from './db/schema';

/**
 * Giving stardust away, shared by the `!gift` chat command and the site.
 *
 * Two rules carry the whole thing:
 *
 *  - A gift is a TRANSFER, not contribution: it moves `stardust` and never `dustEarned`. Otherwise
 *    the wealth cosmetics stop measuring what someone did for a channel and start measuring who
 *    they know. Same reasoning as the welcome bonus and a roulette payout, and the reason this
 *    cannot simply call `awardDust` — that one credits both.
 *  - The recipient does not need an account. An unknown twitch id accumulates in `pending_dust`
 *    exactly as chat earnings do, so gifting a stranger is also an invitation: the bot can tell
 *    them something is waiting.
 *
 * Consequence worth naming: dust becomes transferable, so the old ceiling — "the most anyone can
 * hold is the catalog, once" — no longer holds. That is fine while every sink is a permanent,
 * non-transferable unlock. Add a CONSUMABLE sink later and holds and caps come back with it.
 */

export interface GiftInput {
  fromUserId: string;
  /** Twitch login as typed. Resolved case-insensitively, `@` tolerated. */
  toLogin: string;
  amount: number;
}

export type GiftOutcome =
  /** The GIVER has no Tossit account, so there is no balance to give from. Chat only: on the site
   *  a session is required before anything is rendered. */
  | { kind: 'noAccount' }
  | { kind: 'tooSmall'; min: number }
  | { kind: 'noFunds'; balance: number }
  | { kind: 'unknown' }
  /** Giving to yourself is not a transaction, and letting it through only invites confusion. */
  | { kind: 'self' }
  | { kind: 'done'; amount: number; toLogin: string; balance: number };

/** A twitch id for this login, or null. Nothing here calls Twitch: the caller may pass a resolver
 *  (the chat module has one) for logins we have never seen. */
async function localTwitchId(login: string): Promise<{ id: string; login: string } | null> {
  // Newest sighting wins. One login can belong to several twitch ids over time — someone renames,
  // and Twitch hands a freed login to somebody else — so an arbitrary row could send a gift to an
  // account that gave the name up long ago.
  const seen = await db
    .select({ id: channelActivity.platformUserId, login: channelActivity.login })
    .from(channelActivity)
    .where(and(eq(channelActivity.platform, 'twitch'), eq(channelActivity.login, login)))
    .orderBy(desc(channelActivity.updatedAt))
    .get();
  if (seen) return { id: seen.id, login: seen.login };

  // A Tossit account whose own login matches and which has a twitch identity attached.
  const acct = await db
    .select({ id: linkedIdentities.providerId, login: users.login })
    .from(users)
    .innerJoin(
      linkedIdentities,
      and(eq(linkedIdentities.userId, users.id), eq(linkedIdentities.provider, 'twitch')),
    )
    .where(eq(users.login, login))
    .get();
  return acct ? { id: acct.id, login: acct.login } : null;
}

export async function giftDust(
  input: GiftInput,
  /** Last resort for a login nobody here has seen — the chat module passes a Helix lookup. */
  resolveRemote?: (login: string) => Promise<{ id: string; login: string } | null>,
): Promise<GiftOutcome> {
  const login = input.toLogin.trim().replace(/^@/, '').toLowerCase();
  if (!login) return { kind: 'unknown' };
  if (!Number.isInteger(input.amount) || input.amount < GIFT.min) {
    return { kind: 'tooSmall', min: GIFT.min };
  }

  const target = (await localTwitchId(login)) ?? (await resolveRemote?.(login)) ?? null;
  if (!target) return { kind: 'unknown' };

  const toUserId = await accountFor(target.id);
  if (toUserId === input.fromUserId) return { kind: 'self' };

  // Charge FIRST with an atomic balance guard, the way every other spend here does — there are no
  // transactions in this repo, so a gift that fails to land must fail before the money moves.
  const charged = await db
    .update(users)
    .set({ stardust: sql`${users.stardust} - ${input.amount}` })
    .where(and(eq(users.id, input.fromUserId), gte(users.stardust, input.amount)));
  if (charged.rowsAffected === 0) {
    const row = await db
      .select({ dust: users.stardust })
      .from(users)
      .where(eq(users.id, input.fromUserId))
      .get();
    return { kind: 'noFunds', balance: row?.dust ?? 0 };
  }

  if (toUserId) {
    await db
      .update(users)
      .set({ stardust: sql`${users.stardust} + ${input.amount}` })
      .where(eq(users.id, toUserId));
  } else {
    await db
      .insert(pendingDust)
      .values({
        platform: 'twitch',
        platformUserId: target.id,
        amount: input.amount,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [pendingDust.platform, pendingDust.platformUserId],
        set: { amount: sql`${pendingDust.amount} + ${input.amount}`, updatedAt: new Date() },
      });
  }

  await db.insert(dustGifts).values({
    fromUserId: input.fromUserId,
    toPlatform: 'twitch',
    toPlatformUserId: target.id,
    toUserId,
    amount: input.amount,
    createdAt: new Date(),
  });

  const after = await db
    .select({ dust: users.stardust })
    .from(users)
    .where(eq(users.id, input.fromUserId))
    .get();
  return { kind: 'done', amount: input.amount, toLogin: target.login, balance: after?.dust ?? 0 };
}

async function accountFor(twitchId: string): Promise<string | null> {
  const row = await db
    .select({ userId: linkedIdentities.userId })
    .from(linkedIdentities)
    .where(and(eq(linkedIdentities.provider, 'twitch'), eq(linkedIdentities.providerId, twitchId)))
    .get();
  return row?.userId ?? null;
}
