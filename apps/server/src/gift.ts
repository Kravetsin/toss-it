import { and, desc, eq, gte, or, sql } from 'drizzle-orm';
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
  /**
   * Who gets it, named by whichever the door can offer. Chat has a typed Twitch login and must
   * resolve it; the site has an account the giver PICKED from search, which is why the site needs
   * no resolution at all and cannot miss by a character.
   */
  to: { login: string } | { userId: string };
  amount: number;
  /** Where the command was typed. A name is resolved against this channel's chatters first — the
   *  person meant is nearly always the person in the room, and display names are not unique. */
  channelId?: string | null;
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

/**
 * A twitch id for a name someone typed, or null.
 *
 * The name may be a LOGIN or a DISPLAY NAME, and it usually is the latter: Twitch's own chat
 * autocomplete inserts the display name, so `!gift 100 @长尺丹丷乇丁丂` is what actually gets sent.
 * Those two are unrelated strings for anyone with an international name — the login stays ASCII —
 * and Helix's `users?login=` only accepts the login, so a login-only chain misses every one of
 * them. We keep display names in channel_activity, which is exactly what that autocomplete inserted.
 *
 * Order matters. A login is unique and a display name is not, so logins win; and within either, a
 * sighting in THIS channel wins over one anywhere else, because the person meant is nearly always
 * the person in the room. Ties break on the newest sighting: one name can belong to several twitch
 * ids over time — someone renames, and Twitch hands a freed login to somebody else.
 */
async function localTwitchId(
  name: string,
  preferChannelId?: string | null,
): Promise<{ id: string; login: string } | null> {
  const byLogin = eq(channelActivity.login, name);
  const byDisplay = eq(sql`lower(${channelActivity.displayName})`, name);

  for (const match of [byLogin, byDisplay]) {
    for (const scope of preferChannelId ? [preferChannelId, null] : [null]) {
      const row = await db
        .select({ id: channelActivity.platformUserId, login: channelActivity.login })
        .from(channelActivity)
        .where(
          and(
            eq(channelActivity.platform, 'twitch'),
            match,
            scope ? eq(channelActivity.channelId, scope) : undefined,
          ),
        )
        .orderBy(desc(channelActivity.updatedAt))
        .get();
      if (row) return { id: row.id, login: row.login };
    }
  }

  // A Tossit account matching by either name, with a twitch identity attached.
  const acct = await db
    .select({ id: linkedIdentities.providerId, login: users.login })
    .from(users)
    .innerJoin(
      linkedIdentities,
      and(eq(linkedIdentities.userId, users.id), eq(linkedIdentities.provider, 'twitch')),
    )
    .where(or(eq(users.login, name), eq(sql`lower(${users.displayName})`, name)))
    .get();
  return acct ? { id: acct.id, login: acct.login } : null;
}

export async function giftDust(
  input: GiftInput,
  /** Last resort for a login nobody here has seen — the chat module passes a Helix lookup. */
  resolveRemote?: (login: string) => Promise<{ id: string; login: string } | null>,
): Promise<GiftOutcome> {
  if (!Number.isInteger(input.amount) || input.amount < GIFT.min) {
    return { kind: 'tooSmall', min: GIFT.min };
  }

  // An account chosen from search needs no lookup and has no platform id to record; a typed login
  // has to be turned into one, and may belong to somebody with no account at all.
  let target: { id: string; login: string } | null = null;
  let toUserId: string | null;
  let toLogin: string;
  if ('userId' in input.to) {
    const acct = await db
      .select({ id: users.id, login: users.login })
      .from(users)
      .where(eq(users.id, input.to.userId))
      .get();
    if (!acct) return { kind: 'unknown' };
    toUserId = acct.id;
    toLogin = acct.login;
  } else {
    const login = input.to.login.trim().replace(/^@/, '').toLowerCase();
    if (!login) return { kind: 'unknown' };
    target =
      (await localTwitchId(login, input.channelId)) ?? (await resolveRemote?.(login)) ?? null;
    if (!target) return { kind: 'unknown' };
    toUserId = await accountFor(target.id);
    toLogin = target.login;
  }
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
  } else if (target) {
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
    toPlatform: target ? 'twitch' : null,
    toPlatformUserId: target?.id ?? null,
    toUserId,
    amount: input.amount,
    createdAt: new Date(),
  });

  const after = await db
    .select({ dust: users.stardust })
    .from(users)
    .where(eq(users.id, input.fromUserId))
    .get();
  return { kind: 'done', amount: input.amount, toLogin, balance: after?.dust ?? 0 };
}

async function accountFor(twitchId: string): Promise<string | null> {
  const row = await db
    .select({ userId: linkedIdentities.userId })
    .from(linkedIdentities)
    .where(and(eq(linkedIdentities.provider, 'twitch'), eq(linkedIdentities.providerId, twitchId)))
    .get();
  return row?.userId ?? null;
}
