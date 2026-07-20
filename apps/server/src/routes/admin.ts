import crypto from 'node:crypto';
import { and, desc, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type {
  AdminBotStatus,
  AdminExclusion,
  AdminLiveChannel,
  AdminPromoCode,
  AdminPromoRedemption,
  AdminUserRow,
} from '@tmw/shared';
import { db } from '../db/index';
import {
  bans,
  channels,
  excludeSelfSends,
  leaderboardExclusions,
  linkedIdentities,
  pendingDust,
  promoCodes,
  promoRedemptions,
  submissions,
  userCosmetics,
  users,
  whitelist,
} from '../db/schema';
import { buildAuthorizeUrl, requireAdmin } from '../auth';
import { config } from '../config';
import type { TwitchChatModule } from '../modules/twitch-chat/index';
import type { PlaybackManager } from '../playback';
import { clearLeaderboardCaches } from './channels';
import { grantNeedsAmount, grantPrefix, isKnownGrant } from './promo';
import { STATE_COOKIE, type OAuthState } from './auth';

// No ambiguous chars (0/O/1/I) so codes are easy to dictate.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Sanity ceilings on a currency faucet — a typo shouldn't be able to mint a fortune.
const GRANT_AMOUNT_CAP = 100_000;
const MAX_USES_CAP = 10_000;

function randomChunk(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

function genCode(prefix: string): string {
  return `${prefix}-${randomChunk(4)}-${randomChunk(4)}`;
}

export interface AdminRoutesDeps {
  twitchChat: TwitchChatModule;
  playback: PlaybackManager;
}

export function registerAdminRoutes(app: FastifyInstance, deps: AdminRoutesDeps): void {
  /** Channels with a connected OBS overlay right now (≈ live). */
  app.get(
    '/api/admin/live-channels',
    async (req, reply): Promise<AdminLiveChannel[] | undefined> => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const live = deps.playback.liveChannels();
      if (live.size === 0) return [];
      const rows = await db
        .select({
          id: channels.id,
          login: users.login,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(channels)
        .innerJoin(users, eq(users.id, channels.ownerUserId))
        .where(inArray(channels.id, [...live.keys()]))
        .all();
      return rows
        .map((r) => ({
          login: r.login,
          displayName: r.displayName,
          avatarUrl: r.avatarUrl,
          overlays: live.get(r.id) ?? 0,
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
  );

  app.get('/api/admin/bot', async (req, reply): Promise<AdminBotStatus | undefined> => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const s = deps.twitchChat.status();
    return { connected: s.connected, login: s.login };
  });

  /** Support view: recent/matching users with balances and account details. */
  app.get<{ Querystring: { q?: string; sort?: string } }>(
    '/api/admin/users',
    async (req, reply): Promise<AdminUserRow[] | undefined> => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const q = (req.query.q ?? '').trim();
      const pattern = `%${q}%`;
      const order = req.query.sort === 'stardust' ? desc(users.stardust) : desc(users.createdAt);
      const rows = await db
        .select()
        .from(users)
        .where(
          q
            ? or(like(users.login, pattern), like(users.displayName, pattern), eq(users.id, q))
            : undefined,
        )
        .orderBy(order)
        .limit(50)
        .all();
      if (rows.length === 0) return [];
      const ids = rows.map((u) => u.id);

      const identityRows = await db
        .select({ userId: linkedIdentities.userId, provider: linkedIdentities.provider })
        .from(linkedIdentities)
        .where(inArray(linkedIdentities.userId, ids))
        .all();
      const channelRows = await db
        .select({ id: channels.id, ownerUserId: channels.ownerUserId })
        .from(channels)
        .where(inArray(channels.ownerUserId, ids))
        .all();
      const cosmeticsRows = await db
        .select({ userId: userCosmetics.userId, n: sql<number>`count(*)` })
        .from(userCosmetics)
        .where(inArray(userCosmetics.userId, ids))
        .groupBy(userCosmetics.userId)
        .all();
      // Normally claimed at login/link — nonzero here means a claim never fired (support case).
      const pendingRows = await db
        .select({ userId: linkedIdentities.userId, amount: pendingDust.amount })
        .from(pendingDust)
        .innerJoin(
          linkedIdentities,
          and(
            eq(linkedIdentities.provider, 'twitch'),
            eq(linkedIdentities.providerId, pendingDust.platformUserId),
          ),
        )
        .where(and(eq(pendingDust.platform, 'twitch'), inArray(linkedIdentities.userId, ids)))
        .all();

      const submissionRows = await db
        .select({
          senderUserId: submissions.senderUserId,
          status: submissions.status,
          n: sql<number>`count(*)`,
        })
        .from(submissions)
        .where(and(inArray(submissions.senderUserId, ids), excludeSelfSends))
        .groupBy(submissions.senderUserId, submissions.status)
        .all();
      const whitelistRows = await db
        .select({ userId: whitelist.userId, n: sql<number>`count(*)` })
        .from(whitelist)
        .where(inArray(whitelist.userId, ids))
        .groupBy(whitelist.userId)
        .all();
      const banRows = await db
        .select({ userId: bans.userId, n: sql<number>`count(*)` })
        .from(bans)
        .where(inArray(bans.userId, ids))
        .groupBy(bans.userId)
        .all();

      const identsBy = new Map<string, string[]>();
      for (const r of identityRows) {
        identsBy.set(r.userId, [...(identsBy.get(r.userId) ?? []), r.provider]);
      }
      const hasChannel = new Set(channelRows.map((r) => r.ownerUserId));
      // Owner ids whose channel overlay is connected right now.
      const liveChannelIds = deps.playback.liveChannels();
      const liveOwnerIds = new Set(
        channelRows.filter((r) => liveChannelIds.has(r.id)).map((r) => r.ownerUserId),
      );
      const cosmeticsBy = new Map(cosmeticsRows.map((r) => [r.userId, r.n]));
      const pendingBy = new Map(pendingRows.map((r) => [r.userId, r.amount]));
      // accepted = passed moderation (approved, incl. already played); expired counts as neither.
      const acceptedBy = new Map<string, number>();
      const rejectedBy = new Map<string, number>();
      for (const r of submissionRows) {
        if (!r.senderUserId) continue;
        if (r.status === 'approved' || r.status === 'played') {
          acceptedBy.set(r.senderUserId, (acceptedBy.get(r.senderUserId) ?? 0) + r.n);
        } else if (r.status === 'rejected') {
          rejectedBy.set(r.senderUserId, r.n);
        }
      }
      const whitelistBy = new Map(whitelistRows.map((r) => [r.userId, r.n]));
      const bansBy = new Map(banRows.map((r) => [r.userId, r.n]));

      return rows.map((u) => ({
        id: u.id,
        login: u.login,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        stardust: u.stardust,
        isFounder: u.founderSince != null,
        createdAt: u.createdAt.getTime(),
        identities: identsBy.get(u.id) ?? [],
        hasChannel: hasChannel.has(u.id),
        pendingDust: pendingBy.get(u.id) ?? 0,
        ownedCosmetics: cosmeticsBy.get(u.id) ?? 0,
        accepted: acceptedBy.get(u.id) ?? 0,
        rejected: rejectedBy.get(u.id) ?? 0,
        whitelistedIn: whitelistBy.get(u.id) ?? 0,
        bannedIn: bansBy.get(u.id) ?? 0,
        isLive: liveOwnerIds.has(u.id),
      }));
    },
  );

  /** Support edit: set a user's stardust balance (audited in server logs). */
  app.patch<{ Params: { id: string }; Body: { stardust?: number } | null }>(
    '/api/admin/users/:id',
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const raw = req.body?.stardust;
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return reply.code(400).send({ error: 'stardust: число ≥ 0' });
      }
      const stardust = Math.min(1_000_000_000, Math.max(0, Math.round(raw)));
      const res = await db.update(users).set({ stardust }).where(eq(users.id, req.params.id));
      if (res.rowsAffected === 0) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }
      req.log.info(
        { admin: admin.id, userId: req.params.id, stardust },
        'admin: stardust set manually',
      );
      return { ok: true, stardust };
    },
  );

  /** Global leaderboard exclusions (bots). */
  app.get(
    '/api/admin/leaderboard-exclusions',
    async (req, reply): Promise<AdminExclusion[] | undefined> => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const rows = await db
        .select()
        .from(leaderboardExclusions)
        .orderBy(desc(leaderboardExclusions.createdAt))
        .all();
      return rows.map((r) => ({ login: r.login, note: r.note, createdAt: r.createdAt.getTime() }));
    },
  );

  app.post<{ Body: { login?: string } | null }>(
    '/api/admin/leaderboard-exclusions',
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      // Twitch logins are lowercase; accept a pasted "@Name" or display name too.
      const login = (req.body?.login ?? '').trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{2,25}$/.test(login)) {
        return reply.code(400).send({ error: 'Некорректный логин Twitch' });
      }
      await db
        .insert(leaderboardExclusions)
        .values({ login, note: req.body?.login?.trim() ?? null, createdAt: new Date() })
        .onConflictDoNothing();
      clearLeaderboardCaches();
      deps.twitchChat.reloadExclusions();
      return { ok: true, login };
    },
  );

  app.delete<{ Params: { login: string } }>(
    '/api/admin/leaderboard-exclusions/:login',
    async (req, reply) => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      await db
        .delete(leaderboardExclusions)
        .where(eq(leaderboardExclusions.login, req.params.login.toLowerCase()));
      clearLeaderboardCaches();
      deps.twitchChat.reloadExclusions();
      return { ok: true };
    },
  );

  /** One-time bot hookup: the admin logs in AS the bot account with chat-read scope. */
  app.get<{ Querystring: { returnTo?: string } }>('/api/admin/bot/connect', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    if (!config.twitch.clientId) {
      return reply.code(503).send({ error: 'TWITCH_CLIENT_ID не настроен' });
    }
    const returnTo =
      typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/')
        ? req.query.returnTo
        : '/';
    const state = crypto.randomBytes(16).toString('hex');
    const payload: OAuthState = { state, returnTo, bot: true };
    reply.setCookie(STATE_COOKIE, JSON.stringify(payload), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      path: '/api/auth',
      maxAge: 600,
    });
    // force_verify so the admin can pick the bot account, not their own session.
    // moderated_channels: the /mod list is the opt-in signal for chat-dust channels.
    // read:chatters: watch-time leaderboard (Get Chatters needs a moderator token).
    // write:chat: answering commands in chat, for channels that opted into it.
    return reply.redirect(
      buildAuthorizeUrl(
        state,
        true,
        'user:read:chat user:write:chat user:read:moderated_channels moderator:read:chatters',
      ),
    );
  });

  app.post<{
    Body: { count?: number; note?: string; grant?: string; grantAmount?: number; maxUses?: number };
  }>('/api/admin/promo', async (req, reply): Promise<{ codes: string[] } | undefined> => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const count = Math.min(20, Math.max(1, Math.floor(Number(req.body?.count) || 1)));
    const note = typeof req.body?.note === 'string' ? req.body.note.trim() || null : null;
    const grant = (req.body?.grant ?? 'founder').trim();
    if (!isKnownGrant(grant)) {
      return reply.code(400).send({ error: `Неизвестный тип гранта: ${grant}` });
    }
    const maxUses = Math.min(MAX_USES_CAP, Math.max(1, Math.floor(Number(req.body?.maxUses) || 1)));

    // Dust is real currency: an unbounded or missing amount must fail loudly, not default to 0.
    let grantAmount: number | null = null;
    if (grantNeedsAmount(grant)) {
      grantAmount = Math.floor(Number(req.body?.grantAmount));
      if (!Number.isFinite(grantAmount) || grantAmount < 1 || grantAmount > GRANT_AMOUNT_CAP) {
        return reply.code(400).send({ error: `Укажите количество от 1 до ${GRANT_AMOUNT_CAP}` });
      }
    }

    const now = new Date();
    const codes = Array.from({ length: count }, () => genCode(grantPrefix(grant)));
    await db
      .insert(promoCodes)
      .values(codes.map((code) => ({ code, grant, grantAmount, note, maxUses, createdAt: now })));
    return { codes };
  });

  app.get('/api/admin/promo', async (req, reply): Promise<AdminPromoCode[] | undefined> => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const rows = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt)).all();
    return rows.map((r) => ({
      code: r.code,
      grant: r.grant,
      grantAmount: r.grantAmount,
      note: r.note,
      createdAt: r.createdAt.getTime(),
      maxUses: r.maxUses,
      usedCount: r.usedCount,
      expiresAt: r.expiresAt ? r.expiresAt.getTime() : null,
    }));
  });

  /** Who redeemed a given code (admin log; also the way to spot farming). */
  app.get<{ Params: { code: string } }>(
    '/api/admin/promo/:code/redemptions',
    async (req, reply): Promise<AdminPromoRedemption[] | undefined> => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const rows = await db
        .select({
          login: users.login,
          displayName: users.displayName,
          createdAt: promoRedemptions.createdAt,
        })
        .from(promoRedemptions)
        .innerJoin(users, eq(users.id, promoRedemptions.userId))
        .where(eq(promoRedemptions.code, req.params.code.trim().toUpperCase()))
        .orderBy(desc(promoRedemptions.createdAt))
        .all();
      return rows.map((r) => ({
        login: r.login,
        displayName: r.displayName,
        createdAt: r.createdAt.getTime(),
      }));
    },
  );

  /** Kill a leaked code. Reuses expiresAt — the redeem path already rejects a past expiry. */
  app.post<{ Params: { code: string } }>(
    '/api/admin/promo/:code/revoke',
    async (req, reply): Promise<{ ok: true } | undefined> => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const code = req.params.code.trim().toUpperCase();
      const res = await db
        .update(promoCodes)
        .set({ expiresAt: new Date() })
        .where(and(eq(promoCodes.code, code), isNull(promoCodes.expiresAt)));
      if (res.rowsAffected === 0) {
        return reply.code(404).send({ error: 'Промокод не найден или уже погашен' });
      }
      app.log.info({ code, admin: admin.id }, 'admin: promo code revoked');
      return { ok: true };
    },
  );
}
