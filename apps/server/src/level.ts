import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { LEVEL_POINTS, xpToLevel } from '@tmw/shared';
import { db } from './db/index';
import { channelActivity, linkedIdentities, submissions } from './db/schema';

export interface LevelKey {
  userId: string | null;
  twitchId: string | null;
}

/**
 * Per-channel level for a batch of identity keys (0 if unknown), in input order. Same XP formula as
 * the chat badge — chat messages + watch-minutes (by twitch id, so it works for unregistered
 * chatters) + 10× aired submissions (by userId). A key may carry either side; the missing one is
 * resolved via linked_identities, so both leaderboards (sends by userId, chat by twitch id), the
 * dashboard (by userId) and the media overlay (by userId) share one implementation.
 */
export async function levelsForKeys(channelId: string, keys: LevelKey[]): Promise<number[]> {
  if (keys.length === 0) return [];
  const userIds = [...new Set(keys.map((k) => k.userId).filter((x): x is string => !!x))];
  const twitchIds = [...new Set(keys.map((k) => k.twitchId).filter((x): x is string => !!x))];

  // Resolve the counterpart identity for keys carrying only one side.
  const twitchByUser = new Map<string, string>();
  const userByTwitch = new Map<string, string>();
  if (userIds.length || twitchIds.length) {
    const idRows = await db
      .select({ userId: linkedIdentities.userId, twitchId: linkedIdentities.providerId })
      .from(linkedIdentities)
      .where(
        and(
          eq(linkedIdentities.provider, 'twitch'),
          or(
            userIds.length ? inArray(linkedIdentities.userId, userIds) : undefined,
            twitchIds.length ? inArray(linkedIdentities.providerId, twitchIds) : undefined,
          ),
        ),
      )
      .all();
    for (const r of idRows) {
      twitchByUser.set(r.userId, r.twitchId);
      userByTwitch.set(r.twitchId, r.userId);
    }
  }

  const resolved = keys.map((k) => ({
    userId: k.userId ?? (k.twitchId ? (userByTwitch.get(k.twitchId) ?? null) : null),
    twitchId: k.twitchId ?? (k.userId ? (twitchByUser.get(k.userId) ?? null) : null),
  }));

  // All-time chat xp (messages + watch) per twitch id.
  const allTwitch = [...new Set(resolved.map((r) => r.twitchId).filter((x): x is string => !!x))];
  const chatByTwitch = new Map<string, number>();
  if (allTwitch.length) {
    const rows = await db
      .select({
        twitchId: channelActivity.platformUserId,
        xp: sql<number>`sum(${channelActivity.messages} + ${channelActivity.watchMinutes})`,
      })
      .from(channelActivity)
      .where(
        and(
          eq(channelActivity.channelId, channelId),
          eq(channelActivity.platform, 'twitch'),
          inArray(channelActivity.platformUserId, allTwitch),
        ),
      )
      .groupBy(channelActivity.platformUserId)
      .all();
    for (const r of rows) chatByTwitch.set(r.twitchId, r.xp ?? 0);
  }

  // Aired (played) submission count per user id.
  const allUsers = [...new Set(resolved.map((r) => r.userId).filter((x): x is string => !!x))];
  const airedByUser = new Map<string, number>();
  if (allUsers.length) {
    const rows = await db
      .select({ userId: submissions.senderUserId, n: sql<number>`count(*)` })
      .from(submissions)
      .where(
        and(
          eq(submissions.channelId, channelId),
          inArray(submissions.senderUserId, allUsers),
          eq(submissions.status, 'played'),
        ),
      )
      .groupBy(submissions.senderUserId)
      .all();
    for (const r of rows) if (r.userId) airedByUser.set(r.userId, r.n ?? 0);
  }

  return resolved.map((r) => {
    const chatXp = r.twitchId ? (chatByTwitch.get(r.twitchId) ?? 0) : 0;
    const airedXp = (r.userId ? (airedByUser.get(r.userId) ?? 0) : 0) * LEVEL_POINTS.airedSend;
    return xpToLevel(chatXp + airedXp);
  });
}

/** Per-channel level per sender userId (dashboard lists). */
export async function levelsForSenders(
  channelId: string,
  userIds: (string | null)[],
): Promise<Map<string, number>> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return new Map();
  const levels = await levelsForKeys(
    channelId,
    ids.map((userId) => ({ userId, twitchId: null })),
  );
  return new Map(ids.map((id, i) => [id, levels[i] ?? 0]));
}

/** Per-channel level for one sender (0 if anon/unknown) — for single live emits. */
export async function levelForSender(channelId: string, userId: string | null): Promise<number> {
  if (!userId) return 0;
  const [level] = await levelsForKeys(channelId, [{ userId, twitchId: null }]);
  return level ?? 0;
}
