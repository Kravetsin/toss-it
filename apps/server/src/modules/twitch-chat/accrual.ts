import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index';
import { pendingDust, users } from '../../db/schema';

/** Same anti-farm convention as sends: at most 1 dust per minute per chatter per channel. */
const COOLDOWN_MS = 60_000;
const lastAward = new Map<string, number>();

/**
 * +1 stardust to a chatter, by raw Twitch id. Existing users get it on the balance
 * directly; unknown ids accumulate in pending_dust until they first log in.
 */
export async function awardChatDust(channelId: string, chatterTwitchId: string): Promise<void> {
  const key = `${channelId}:${chatterTwitchId}`;
  const now = Date.now();
  const last = lastAward.get(key);
  if (last !== undefined && now - last < COOLDOWN_MS) return;
  lastAward.set(key, now);
  pruneCooldowns(now);

  const res = await db
    .update(users)
    .set({ stardust: sql`${users.stardust} + 1` })
    .where(eq(users.id, `twitch:${chatterTwitchId}`));
  if (res.rowsAffected > 0) return;

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

// Entries older than the window are dead weight; keep the map bounded.
function pruneCooldowns(now: number): void {
  if (lastAward.size < 10_000) return;
  for (const [key, t] of lastAward) {
    if (now - t >= COOLDOWN_MS) lastAward.delete(key);
  }
}
