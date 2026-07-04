import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AdminBotStatus, AdminPromoCode } from '@tmw/shared';
import { db } from '../db/index';
import { promoCodes, users } from '../db/schema';
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
