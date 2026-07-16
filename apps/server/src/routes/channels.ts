import crypto from 'node:crypto';
import { and, count, desc, eq, gte, inArray, isNotNull, notInArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  ChannelSelf,
  LeaderboardEntry,
  LeaderboardMetric,
  LeaderboardPeriod,
  PublicChannelInfo,
} from '@tmw/shared';
import { db } from '../db/index';
import {
  channelActivity,
  channels,
  leaderboardExclusions,
  linkedIdentities,
  submissions,
  users,
} from '../db/schema';
import { config } from '../config';
import { levelsForKeys } from '../level';
import { getSessionUser, requireUser } from '../auth';

function newOverlayToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

const LB_METRICS: readonly string[] = ['sends', 'messages', 'watch', 'level'];
const LB_PERIODS: readonly string[] = ['month', 'all'];
const LB_CACHE_MS = 30_000;
/** The page polls every minute; cache keeps repeated public hits off the DB. */
const lbCache = new Map<string, { at: number; entries: LeaderboardEntry[] }>();

/** Global excluded logins (bots), cached briefly. All logins stored lowercase. */
let exclCache: { at: number; logins: string[] } | null = null;
async function excludedLogins(): Promise<string[]> {
  if (exclCache && Date.now() - exclCache.at < LB_CACHE_MS) return exclCache.logins;
  const rows = await db
    .select({ login: leaderboardExclusions.login })
    .from(leaderboardExclusions)
    .all();
  exclCache = { at: Date.now(), logins: rows.map((r) => r.login) };
  return exclCache.logins;
}

/** Called by the admin routes after an exclusion changes, so the board updates at once. */
export function clearLeaderboardCaches(): void {
  lbCache.clear();
  exclCache = null;
}

const monthStartUtc = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};
const currentMonth = () => new Date().toISOString().slice(0, 7);

/** Top-10 by media that actually played (the original leaderboard). */
async function sendsBoard(
  channelId: string,
  period: LeaderboardPeriod,
  excluded: string[],
): Promise<LeaderboardEntry[]> {
  const rows = await db
    .select({
      userId: submissions.senderUserId,
      login: users.login,
      displayName: users.displayName,
      founderSince: users.founderSince,
      equipped: users.equipped,
      value: count(),
    })
    .from(submissions)
    .innerJoin(users, eq(users.id, submissions.senderUserId))
    .where(
      and(
        eq(submissions.channelId, channelId),
        eq(submissions.status, 'played'),
        isNotNull(submissions.senderUserId),
        ...(period === 'month' ? [gte(submissions.createdAt, monthStartUtc())] : []),
        ...(excluded.length ? [notInArray(users.login, excluded)] : []),
      ),
    )
    .groupBy(submissions.senderUserId)
    .orderBy(desc(count()))
    .limit(10)
    .all();

  const levels = await levelsForKeys(
    channelId,
    rows.map((r) => ({ userId: r.userId, twitchId: null })),
  );
  return rows.map((r, i) => ({
    userId: r.userId!,
    login: r.login,
    displayName: r.displayName,
    value: r.value,
    isFounder: r.founderSince != null,
    nickColor: r.equipped?.nickColor ?? null,
    nickEffect: r.equipped?.nickEffect ?? null,
    cardEffect: r.equipped?.cardEffect ?? null,
    level: levels[i] ?? 0,
  }));
}

/** Top-10 by chat activity (bot counters), bridged to Tossit accounts where linked. */
async function chatBoard(
  channelId: string,
  metric: 'messages' | 'watch' | 'level',
  period: LeaderboardPeriod,
  excluded: string[],
): Promise<LeaderboardEntry[]> {
  // SUM aggregates months for 'all'; for a single month it's a no-op.
  const valueExpr =
    metric === 'messages'
      ? sql<number>`sum(${channelActivity.messages})`
      : metric === 'watch'
        ? sql<number>`sum(${channelActivity.watchMinutes})`
        : sql<number>`sum(${channelActivity.messages}) + sum(${channelActivity.watchMinutes})`;
  const rows = await db
    .select({
      platformUserId: channelActivity.platformUserId,
      displayName: sql<string>`max(${channelActivity.displayName})`,
      login: sql<string>`max(${channelActivity.login})`,
      value: valueExpr,
    })
    .from(channelActivity)
    .where(
      and(
        eq(channelActivity.channelId, channelId),
        eq(channelActivity.platform, 'twitch'),
        ...(period === 'month' ? [eq(channelActivity.month, currentMonth())] : []),
        ...(excluded.length ? [notInArray(channelActivity.login, excluded)] : []),
      ),
    )
    .groupBy(channelActivity.platformUserId)
    .orderBy(desc(valueExpr))
    .limit(10)
    .all();

  // Linked/native accounts get their Tossit nick, colors and badge — same perks
  // as the sends board (and one more reason to link Twitch).
  const ids = rows.map((r) => r.platformUserId);
  const identityRows = ids.length
    ? await db
        .select({ providerId: linkedIdentities.providerId, user: users })
        .from(linkedIdentities)
        .innerJoin(users, eq(users.id, linkedIdentities.userId))
        .where(
          and(eq(linkedIdentities.provider, 'twitch'), inArray(linkedIdentities.providerId, ids)),
        )
        .all()
    : [];
  const accountByTwitchId = new Map(identityRows.map((r) => [r.providerId, r.user]));

  const levels = await levelsForKeys(
    channelId,
    rows.map((r) => ({
      userId: accountByTwitchId.get(r.platformUserId)?.id ?? null,
      twitchId: r.platformUserId,
    })),
  );
  const entries = rows.map((r, i) => {
    const u = accountByTwitchId.get(r.platformUserId);
    const level = levels[i] ?? 0;
    return {
      userId: u?.id ?? `twitch:${r.platformUserId}`,
      login: u?.login ?? r.login,
      displayName: u?.displayName ?? r.displayName,
      // The 'level' metric now shows the full level (same value the rank badge uses).
      value: metric === 'level' ? level : r.value,
      isFounder: u?.founderSince != null,
      nickColor: u?.equipped?.nickColor ?? null,
      nickEffect: u?.equipped?.nickEffect ?? null,
      cardEffect: u?.equipped?.cardEffect ?? null,
      level,
    };
  });
  // The Level tab is the overall-rank board: order by the level itself (the base query orders by
  // chat XP, which aired submissions can nudge — re-sort so the ranks are exactly descending).
  if (metric === 'level') entries.sort((a, b) => b.level! - a.level!);
  return entries;
}

export function registerChannelRoutes(app: FastifyInstance): void {
  app.post('/api/channels', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const existing = await db
      .select()
      .from(channels)
      .where(eq(channels.ownerUserId, user.id))
      .get();
    if (existing) {
      return reply.code(409).send({ error: 'Канал уже создан' });
    }

    const channel = {
      id: crypto.randomUUID(),
      ownerUserId: user.id,
      overlayToken: newOverlayToken(),
      createdAt: new Date(),
      // New channels default to a separate music position — music shouldn't take the
      // media spot. (Column default stays false so existing channels keep their choice.)
      musicSeparate: true,
    };
    await db.insert(channels).values(channel);
    const response: ChannelSelf = { id: channel.id, overlayToken: channel.overlayToken };
    return reply.code(201).send(response);
  });

  /** Rotates overlay token; invalidates the old OBS URL. */
  app.post('/api/channels/rotate-token', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;

    const channel = await db.select().from(channels).where(eq(channels.ownerUserId, user.id)).get();
    if (!channel) return reply.code(404).send({ error: 'Канал не создан' });

    const overlayToken = newOverlayToken();
    await db.update(channels).set({ overlayToken }).where(eq(channels.id, channel.id));
    const response: ChannelSelf = { id: channel.id, overlayToken };
    return response;
  });

  app.get<{ Params: { login: string } }>('/api/c/:login', async (req, reply) => {
    const row = await db
      .select({
        channelId: channels.id,
        login: users.login,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        accepting: channels.accepting,
        maxDurationMs: channels.maxDurationMs,
        maxAudioDurationMs: channels.maxAudioDurationMs,
        maxFileSizeBytes: channels.maxFileSizeBytes,
        autoApproveGifs: channels.autoApproveGifs,
        ttsName: channels.ttsName,
        ttsMessage: channels.ttsMessage,
        description: channels.description,
        links: channels.links,
        founderSince: users.founderSince,
        equipped: users.equipped,
        accentHue: channels.accentHue,
        bgHue: channels.bgHue,
        bgTint: channels.bgTint,
      })
      .from(channels)
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      .where(eq(users.login, req.params.login.toLowerCase()))
      .get();
    if (!row) return reply.code(404).send({ error: 'Канал не найден' });
    const {
      channelId,
      founderSince,
      equipped,
      ttsName,
      ttsMessage,
      accentHue,
      bgHue,
      bgTint,
      ...rest
    } = row;
    // The logged-in viewer's own per-channel level — so their header card matches the chat badge.
    const viewer = await getSessionUser(req);
    const [viewerLevel = 0] = viewer
      ? await levelsForKeys(channelId, [{ userId: viewer.id, twitchId: null }])
      : [];
    const response: PublicChannelInfo = {
      ...rest,
      ttsEnabled: ttsName || ttsMessage,
      isFounder: founderSince != null,
      nickColor: equipped?.nickColor ?? null,
      nickEffect: equipped?.nickEffect ?? null,
      cardEffect: equipped?.cardEffect ?? null,
      theme: { accentHue, bgHue, bgTint },
      viewerLevel,
    };
    return response;
  });

  // Remaining viewer cooldown so the page can show the timer right after a refresh,
  // instead of only discovering it on the next (rejected) send. 0 if owner/none/logged out.
  app.get<{ Params: { login: string } }>('/api/c/:login/cooldown', async (req) => {
    // windowSec = full cooldown, so the client can show the fill at the right fraction on refresh.
    const windowSec = Math.round(config.moderation.viewerCooldownMs / 1000);
    const user = await getSessionUser(req);
    if (!user) return { cooldownSec: 0, windowSec };
    const channel = await db
      .select({ id: channels.id, ownerUserId: channels.ownerUserId })
      .from(channels)
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      .where(eq(users.login, req.params.login.toLowerCase()))
      .get();
    if (!channel || channel.ownerUserId === user.id) return { cooldownSec: 0, windowSec };
    const last = await db
      .select({ createdAt: submissions.createdAt })
      .from(submissions)
      .where(and(eq(submissions.channelId, channel.id), eq(submissions.senderUserId, user.id)))
      .orderBy(desc(submissions.createdAt))
      .get();
    if (!last) return { cooldownSec: 0, windowSec };
    const remaining = config.moderation.viewerCooldownMs - (Date.now() - last.createdAt.getTime());
    return { cooldownSec: remaining > 0 ? Math.ceil(remaining / 1000) : 0, windowSec };
  });

  app.get<{ Params: { login: string }; Querystring: { metric?: string; period?: string } }>(
    '/api/c/:login/leaderboard',
    async (req, reply) => {
      // Unknown values fall back to the defaults — the URL is public input.
      const metric = (
        LB_METRICS.includes(req.query.metric ?? '') ? req.query.metric : 'sends'
      ) as LeaderboardMetric;
      const period = (
        LB_PERIODS.includes(req.query.period ?? '') ? req.query.period : 'all'
      ) as LeaderboardPeriod;
      const channel = await db
        .select({ id: channels.id })
        .from(channels)
        .innerJoin(users, eq(users.id, channels.ownerUserId))
        .where(eq(users.login, req.params.login.toLowerCase()))
        .get();
      if (!channel) return reply.code(404).send({ error: 'Канал не найден' });

      const cacheKey = `${channel.id}:${metric}:${period}`;
      const hit = lbCache.get(cacheKey);
      if (hit && Date.now() - hit.at < LB_CACHE_MS) return hit.entries;

      const excluded = await excludedLogins();
      const entries =
        metric === 'sends'
          ? await sendsBoard(channel.id, period, excluded)
          : await chatBoard(channel.id, metric, period, excluded);
      lbCache.set(cacheKey, { at: Date.now(), entries });
      return entries;
    },
  );
}
