import crypto from 'node:crypto';
import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AdminBotStatus, AdminPromoCode, AdminUserRow } from '@tmw/shared';
import { db } from '../db/index';
import {
  channels,
  linkedIdentities,
  pendingDust,
  promoCodes,
  userCosmetics,
  users,
} from '../db/schema';
import { buildAuthorizeUrl, requireAdmin } from '../auth';
import { config } from '../config';
import type { TwitchChatModule } from '../modules/twitch-chat/index';
import { isKnownGrant } from './promo';
import { STATE_COOKIE, type OAuthState } from './auth';

// No ambiguous chars (0/O/1/I) so codes are easy to dictate.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChunk(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return out;
}

function genCode(): string {
  return `FND-${randomChunk(4)}-${randomChunk(4)}`;
}

export interface AdminRoutesDeps {
  twitchChat: TwitchChatModule;
}

export function registerAdminRoutes(app: FastifyInstance, deps: AdminRoutesDeps): void {
  app.get('/api/admin/bot', async (req, reply): Promise<AdminBotStatus | undefined> => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const s = deps.twitchChat.status();
    return { connected: s.connected, login: s.login };
  });

  /** Support view: recent/matching users with balances and account details. */
  app.get<{ Querystring: { q?: string } }>(
    '/api/admin/users',
    async (req, reply): Promise<AdminUserRow[] | undefined> => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const q = (req.query.q ?? '').trim();
      const pattern = `%${q}%`;
      const rows = await db
        .select()
        .from(users)
        .where(
          q
            ? or(like(users.login, pattern), like(users.displayName, pattern), eq(users.id, q))
            : undefined,
        )
        .orderBy(desc(users.createdAt))
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
        .select({ ownerUserId: channels.ownerUserId })
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

      const identsBy = new Map<string, string[]>();
      for (const r of identityRows) {
        identsBy.set(r.userId, [...(identsBy.get(r.userId) ?? []), r.provider]);
      }
      const hasChannel = new Set(channelRows.map((r) => r.ownerUserId));
      const cosmeticsBy = new Map(cosmeticsRows.map((r) => [r.userId, r.n]));
      const pendingBy = new Map(pendingRows.map((r) => [r.userId, r.amount]));

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

  /** One-time bot hookup: the admin logs in AS the bot account with chat-read scope. */
  app.get<{ Querystring: { returnTo?: string } }>(
    '/api/admin/bot/connect',
    async (req, reply) => {
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
      return reply.redirect(
        buildAuthorizeUrl(
          state,
          true,
          'user:read:chat user:read:moderated_channels moderator:read:chatters',
        ),
      );
    },
  );

  app.post<{ Body: { count?: number; note?: string; grant?: string } }>(
    '/api/admin/promo',
    async (req, reply): Promise<{ codes: string[] } | undefined> => {
      const admin = await requireAdmin(req, reply);
      if (!admin) return;
      const count = Math.min(20, Math.max(1, Math.floor(Number(req.body?.count) || 1)));
      const note = typeof req.body?.note === 'string' ? req.body.note.trim() || null : null;
      const grant = (req.body?.grant ?? 'founder').trim();
      if (!isKnownGrant(grant)) {
        return reply.code(400).send({ error: `Неизвестный тип гранта: ${grant}` });
      }
      const now = new Date();
      const codes = Array.from({ length: count }, genCode);
      await db
        .insert(promoCodes)
        .values(codes.map((code) => ({ code, grant, note, createdAt: now })));
      return { codes };
    },
  );

  app.get('/api/admin/promo', async (req, reply): Promise<AdminPromoCode[] | undefined> => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const rows = await db
      .select({
        code: promoCodes.code,
        grant: promoCodes.grant,
        note: promoCodes.note,
        createdAt: promoCodes.createdAt,
        redeemedAt: promoCodes.redeemedAt,
        redeemedByLogin: users.login,
      })
      .from(promoCodes)
      .leftJoin(users, eq(users.id, promoCodes.redeemedByUserId))
      .orderBy(desc(promoCodes.createdAt))
      .all();
    return rows.map((r) => ({
      code: r.code,
      grant: r.grant,
      note: r.note,
      createdAt: r.createdAt.getTime(),
      redeemedByLogin: r.redeemedByLogin,
      redeemedAt: r.redeemedAt ? r.redeemedAt.getTime() : null,
    }));
  });
}
