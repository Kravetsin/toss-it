import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { COSMETICS, LEVEL_POINTS, xpToLevel, type BreadthTotals } from '@tmw/shared';
import { db } from './db/index';
import {
  channelActivity,
  chatModeratorSightings,
  excludeSelfSends,
  linkedIdentities,
  submissions,
  userCosmetics,
  users,
} from './db/schema';
import { dustSpentOnNames } from './displayName';

export interface LevelKey {
  userId: string | null;
  twitchId: string | null;
}

/**
 * Per-channel level for a batch of identity keys (0 if unknown), in input order. Thin wrapper over
 * xpForKeys — the level IS xpToLevel(xp); callers that also want the raw number (the XP tooltip)
 * call xpForKeys directly.
 */
export async function levelsForKeys(channelId: string, keys: LevelKey[]): Promise<number[]> {
  return (await xpForKeys(channelId, keys)).map(xpToLevel);
}

/**
 * Per-channel raw XP for a batch of identity keys (0 if unknown), in input order. Chat messages +
 * watch-minutes (by twitch id, so it works for unregistered chatters) + 50× aired submissions (by
 * userId). A key may carry either side; the missing one is resolved via linked_identities, so
 * leaderboards (sends by userId, chat by twitch id), the dashboard and the media overlay share one
 * implementation.
 */
export async function xpForKeys(channelId: string, keys: LevelKey[]): Promise<number[]> {
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
          excludeSelfSends,
        ),
      )
      .groupBy(submissions.senderUserId)
      .all();
    for (const r of rows) if (r.userId) airedByUser.set(r.userId, r.n ?? 0);
  }

  return resolved.map((r) => {
    const chatXp = r.twitchId ? (chatByTwitch.get(r.twitchId) ?? 0) : 0;
    const airedXp = (r.userId ? (airedByUser.get(r.userId) ?? 0) : 0) * LEVEL_POINTS.airedSend;
    return chatXp + airedXp;
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

/**
 * Sums one channelActivity column across ALL channels for every platform identity linked to the
 * user — so someone active on many channels earns from the total. 0 if no identity is linked yet.
 */
async function activityTotalFor(
  userId: string,
  col: typeof channelActivity.messages | typeof channelActivity.watchMinutes,
): Promise<number> {
  const ids = await db
    .select({ provider: linkedIdentities.provider, providerId: linkedIdentities.providerId })
    .from(linkedIdentities)
    .where(eq(linkedIdentities.userId, userId))
    .all();
  if (ids.length === 0) return 0;
  const row = await db
    .select({ n: sql<number>`coalesce(sum(${col}), 0)` })
    .from(channelActivity)
    .where(
      or(
        ...ids.map((i) =>
          and(
            eq(channelActivity.platform, i.provider),
            eq(channelActivity.platformUserId, i.providerId),
          ),
        ),
      ),
    )
    .get();
  return row?.n ?? 0;
}

/** Account-wide chat message count, for earned cosmetics gated on `earn.metric === 'messages'`. */
export async function messagesTotalFor(userId: string): Promise<number> {
  return activityTotalFor(userId, channelActivity.messages);
}

/** Account-wide watch time in minutes, for cosmetics gated on `earn.metric === 'watchMinutes'`. */
export async function watchMinutesTotalFor(userId: string): Promise<number> {
  return activityTotalFor(userId, channelActivity.watchMinutes);
}

/** Lifetime dust EARNED (never decremented by spending), for cosmetics gated on
 *  `earn.metric === 'dustEarned'`. A direct column read — the counter is kept live at every earn
 *  site (see creditDust), so nothing to aggregate here. */
export async function dustEarnedFor(userId: string): Promise<number> {
  const row = await db
    .select({ n: users.dustEarned })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.n ?? 0;
}

/** Greens CAUGHT, for cosmetics gated on `earn.metric === 'rouletteGreens'`. A direct column read
 *  — the counter is kept live at the one site that can move it (see noteSpin). */
export async function rouletteGreensFor(userId: string): Promise<number> {
  const row = await db
    .select({ n: users.rouletteGreens })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.n ?? 0;
}

/** Wheel wins of any colour, for cosmetics gated on `earn.metric === 'rouletteWins'`. Same live
 *  column read as the greens — noteSpin is the one site that moves either. */
export async function rouletteWinsFor(userId: string): Promise<number> {
  const row = await db
    .select({ n: users.rouletteWins })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.n ?? 0;
}

/**
 * Lifetime dust SPENT, for cosmetics gated on `earn.metric === 'dustSpent'`. Derived from what the
 * user owns rather than kept as a counter, which is safe for exactly one reason: every dust sink is
 * a permanent, non-transferable grant (see the sink invariant), so this sum can only ever climb.
 *
 * `paidDust` is the price frozen at purchase; rows written before that column exist carry 0, so those
 * fall back to today's catalog price. That fallback is the only place a price edit can still move an
 * old row, and it shrinks to nothing as pre-column purchases age out.
 *
 * Bought names are summed alongside, from their own ledger: they are a sink like any other, and a
 * viewer who spent five thousand dust on names would otherwise read as having spent nothing.
 */
export async function dustSpentFor(userId: string): Promise<number> {
  const rows = await db
    .select({ itemId: userCosmetics.itemId, paidDust: userCosmetics.paidDust })
    .from(userCosmetics)
    .where(eq(userCosmetics.userId, userId))
    .all();
  const onItems = rows.reduce(
    (sum, r) => sum + (r.paidDust || (COSMETICS.find((c) => c.id === r.itemId)?.costDust ?? 0)),
    0,
  );
  return onItems + (await dustSpentOnNames(userId));
}

/**
 * Account-wide submission count, for cosmetics gated on `earn.metric === 'submissions'`. Counts every
 * channel and every status — a channel-points song request counts the same as a clip, which is the
 * point: the axis rewards bringing things, not passing moderation. Self-sends are excluded so a
 * streamer can't farm it on their own channel.
 */
export async function submissionsTotalFor(userId: string): Promise<number> {
  const row = await db
    .select({ n: sql<number>`count(*)` })
    .from(submissions)
    .where(and(eq(submissions.senderUserId, userId), excludeSelfSends))
    .get();
  return row?.n ?? 0;
}

/**
 * The BREADTH axis: what the user has done in EACH channel, rather than in total. Returned as
 * per-channel lists so one payload answers every rung of every ladder (see BreadthTotals) — the
 * alternative was a separate aggregate per threshold in the catalog, on every /me.
 *
 * Four cheap queries. `channel_activity` is bucketed per month, so its two columns are summed per
 * channel first; submissions are counted per channel with self-sends excluded, as everywhere else.
 */
export async function breadthFor(userId: string): Promise<BreadthTotals> {
  const ids = await db
    .select({ provider: linkedIdentities.provider, providerId: linkedIdentities.providerId })
    .from(linkedIdentities)
    .where(eq(linkedIdentities.userId, userId))
    .all();
  const mine = ids.length
    ? or(
        ...ids.map((i) =>
          and(
            eq(channelActivity.platform, i.provider),
            eq(channelActivity.platformUserId, i.providerId),
          ),
        ),
      )
    : undefined;

  // Activity rows exist only where the identity chatted or watched, so both lists come from one
  // grouped scan; a channel with zero of one column simply lands at 0 and fails any bar.
  const activity = mine
    ? await db
        .select({
          channelId: channelActivity.channelId,
          messages: sql<number>`coalesce(sum(${channelActivity.messages}), 0)`,
          watchMinutes: sql<number>`coalesce(sum(${channelActivity.watchMinutes}), 0)`,
        })
        .from(channelActivity)
        .where(mine)
        .groupBy(channelActivity.channelId)
        .all()
    : [];

  const sends = await db
    .select({ channelId: submissions.channelId, n: sql<number>`count(*)` })
    .from(submissions)
    .where(and(eq(submissions.senderUserId, userId), excludeSelfSends))
    .groupBy(submissions.channelId)
    .all();

  const moderated = ids.length
    ? ((
        await db
          .select({ n: sql<number>`count(*)` })
          .from(chatModeratorSightings)
          .where(
            or(
              ...ids.map((i) =>
                and(
                  eq(chatModeratorSightings.platform, i.provider),
                  eq(chatModeratorSightings.platformUserId, i.providerId),
                ),
              ),
            ),
          )
          .get()
      )?.n ?? 0)
    : 0;

  const desc = (xs: number[]) => xs.filter((n) => n > 0).sort((a, b) => b - a);
  return {
    messages: desc(activity.map((r) => r.messages)),
    watchMinutes: desc(activity.map((r) => r.watchMinutes)),
    submissions: desc(sends.map((r) => r.n)),
    moderated,
  };
}

/**
 * Records that this identity wears the moderator badge in this channel. Append-only and idempotent:
 * the first sighting wins and nothing ever removes it (see chat_moderator_sightings). Call it from
 * the chat pipeline — it is a no-op after the first message.
 */
export async function noteChatModerator(
  channelId: string,
  platform: string,
  platformUserId: string,
): Promise<void> {
  await db
    .insert(chatModeratorSightings)
    .values({ channelId, platform, platformUserId, seenAt: new Date() })
    .onConflictDoNothing();
}

/** Per-channel level for one sender (0 if anon/unknown) — for single live emits. */
export async function levelForSender(channelId: string, userId: string | null): Promise<number> {
  if (!userId) return 0;
  const [level] = await levelsForKeys(channelId, [{ userId, twitchId: null }]);
  return level ?? 0;
}
