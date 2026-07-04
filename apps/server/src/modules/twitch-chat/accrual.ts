import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index';
import { linkedIdentities, pendingDust, users } from '../../db/schema';

/**
 * +1 stardust to a chatter, by raw Twitch id. Identity lookup covers both native
 * Twitch accounts and Google accounts with a linked Twitch; unknown ids accumulate
 * in pending_dust until they first log in.
 * No cooldown by design (economy: 1 msg = 1 dust, send = 10) — Twitch's own chat
 * rate limits and the live-gate are the spam ceiling.
 */
export async function awardChatDust(chatterTwitchId: string): Promise<void> {
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
      .set({ stardust: sql`${users.stardust} + 1` })
      .where(eq(users.id, identity.userId));
    return;
  }

  await db
    .insert(pendingDust)
    .values({ platform: 'twitch', platformUserId: chatterTwitchId, amount: 1, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [pendingDust.platform, pendingDust.platformUserId],
      set: { amount: sql`${pendingDust.amount} + 1`, updatedAt: new Date() },
    });
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
