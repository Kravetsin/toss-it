import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index';
import { linkedIdentities, pendingDust, users } from '../../db/schema';

/**
 * Award stardust by raw Twitch id. Identity lookup covers both native Twitch accounts and Google
 * accounts with a linked Twitch; unknown ids accumulate in pending_dust until they first log in.
 * Weights mirror the level XP ones (1 msg = 1, 1 watched minute = 1, aired send = 10) so there is
 * one mental model. No cooldown by design — Twitch's own chat rate limits are the spam ceiling.
 */
export async function awardDust(chatterTwitchId: string, amount = 1): Promise<void> {
  if (amount <= 0) return;
  const identity = await db
    .select({ userId: linkedIdentities.userId })
    .from(linkedIdentities)
    .where(
      and(
        eq(linkedIdentities.provider, 'twitch'),
        eq(linkedIdentities.providerId, chatterTwitchId),
      ),
    )
    .get();
  if (identity) {
    await db
      .update(users)
      .set({ stardust: sql`${users.stardust} + ${amount}` })
      .where(eq(users.id, identity.userId));
    return;
  }

  await db
    .insert(pendingDust)
    .values({
      platform: 'twitch',
      platformUserId: chatterTwitchId,
      amount,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [pendingDust.platform, pendingDust.platformUserId],
      set: { amount: sql`${pendingDust.amount} + ${amount}`, updatedAt: new Date() },
    });
}

/**
 * Current stardust for a raw Twitch id. `claimed` is false when the dust is still sitting in
 * pending_dust — the chatter earned it but has never logged in, which is exactly who the
 * "claim it at toss-it.win" nudge is for.
 */
export async function readDust(
  chatterTwitchId: string,
): Promise<{ dust: number; claimed: boolean }> {
  const identity = await db
    .select({ userId: linkedIdentities.userId })
    .from(linkedIdentities)
    .where(
      and(
        eq(linkedIdentities.provider, 'twitch'),
        eq(linkedIdentities.providerId, chatterTwitchId),
      ),
    )
    .get();
  if (identity) {
    const row = await db
      .select({ dust: users.stardust })
      .from(users)
      .where(eq(users.id, identity.userId))
      .get();
    return { dust: row?.dust ?? 0, claimed: true };
  }
  const pending = await db
    .select({ amount: pendingDust.amount })
    .from(pendingDust)
    .where(and(eq(pendingDust.platform, 'twitch'), eq(pendingDust.platformUserId, chatterTwitchId)))
    .get();
  return { dust: pending?.amount ?? 0, claimed: false };
}

/**
 * Move a platform identity's pending dust onto a real account (at login).
 * Returns the claimed amount. Delete-first with RETURNING makes concurrent
 * logins credit at most once.
 */
export async function claimPendingDust(
  platform: string,
  platformUserId: string,
  creditUserId: string,
): Promise<number> {
  const taken = await db
    .delete(pendingDust)
    .where(and(eq(pendingDust.platform, platform), eq(pendingDust.platformUserId, platformUserId)))
    .returning({ amount: pendingDust.amount });
  const amount = taken[0]?.amount ?? 0;
  if (amount <= 0) return 0;
  await db
    .update(users)
    .set({ stardust: sql`${users.stardust} + ${amount}` })
    .where(eq(users.id, creditUserId));
  return amount;
}
