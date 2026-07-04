import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { MeResponse } from '@tmw/shared';
import { db } from '../db/index';
import { channels, userCosmetics, users } from '../db/schema';
import { config } from '../config';
import {
  buildAuthorizeUrl,
  buildGoogleAuthorizeUrl,
  createSession,
  destroySession,
  ensureUniqueLogin,
  exchangeCodeForUser,
  exchangeGoogleCodeForUser,
  exchangeTwitchCode,
  fetchTwitchUser,
  getSessionUser,
  isAdmin,
  requireAdmin,
  upsertUser,
} from '../auth';
import { claimPendingDust } from '../modules/twitch-chat/accrual';
import { saveBotCredentials } from '../modules/twitch-chat/token';
import type { TwitchChatModule } from '../modules/twitch-chat/index';

export const STATE_COOKIE = 'oauth_state';
const FAKE_LOGIN_RE = /^[a-z0-9_]{2,25}$/i;

/** OAuth state cookie payload. bot=true marks the admin's bot-connect flow. */
export interface OAuthState {
  state: string;
  returnTo: string;
  bot?: boolean;
}

/** returnTo must be a relative path — open-redirect guard. */
function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

export interface AuthRoutesDeps {
  twitchChat: TwitchChatModule;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRoutesDeps): void {
  app.get<{ Querystring: { fake?: string; returnTo?: string; switch?: string } }>(
    '/api/auth/login',
    async (req, reply) => {
      const returnTo = safeReturnTo(req.query.returnTo);
      // ?switch=1 forces the Twitch screen so the user can switch accounts.
      const forceVerify = req.query.switch !== undefined;

      if (req.query.fake !== undefined) {
        if (!config.allowFakeAuth) {
          return reply.code(403).send({ error: 'Фейковая авторизация выключена' });
        }
        const login = req.query.fake.toLowerCase();
        if (!FAKE_LOGIN_RE.test(login)) {
          return reply.code(400).send({ error: 'Некорректный fake-логин' });
        }
        const user = await upsertUser({
          id: `fake:${login}`,
          login,
          displayName: login,
          avatarUrl: null,
        });
        await createSession(reply, user.id);
        return reply.redirect(config.webUrl + returnTo);
      }

      if (!config.twitch.clientId) {
        return reply.code(503).send({
          error: 'TWITCH_CLIENT_ID не настроен. Для локалки: /api/auth/login?fake=<login>',
        });
      }

      const state = crypto.randomBytes(16).toString('hex');
      reply.setCookie(STATE_COOKIE, JSON.stringify({ state, returnTo }), {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProd,
        path: '/api/auth',
        maxAge: 600,
      });
      return reply.redirect(buildAuthorizeUrl(state, forceVerify));
    },
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/callback',
    async (req, reply) => {
      const raw = req.cookies[STATE_COOKIE];
      const unsigned = raw ? req.unsignCookie(raw) : null;
      reply.clearCookie(STATE_COOKIE, { path: '/api/auth' });

      if (!unsigned?.valid) {
        return reply.code(400).send({ error: 'Потерян state (куки). Попробуй войти ещё раз.' });
      }
      const saved = JSON.parse(unsigned.value) as OAuthState;
      if (req.query.error || !req.query.code || req.query.state !== saved.state) {
        return reply
          .code(400)
          .send({ error: `Авторизация не удалась: ${req.query.error ?? 'bad state'}` });
      }

      // Bot connect (admin-initiated, see /api/admin/bot/connect): store the bot
      // account's tokens instead of logging anyone in.
      if (saved.bot) {
        const admin = await requireAdmin(req, reply);
        if (!admin) return;
        const tokens = await exchangeTwitchCode(req.query.code);
        const bot = await fetchTwitchUser(tokens.accessToken);
        await saveBotCredentials({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          userId: bot.id,
          login: bot.login,
        });
        deps.twitchChat.credentialsChanged();
        return reply.redirect(config.webUrl + safeReturnTo(saved.returnTo));
      }

      const info = await exchangeCodeForUser(req.query.code);
      const user = await upsertUser(info);
      await createSession(reply, user.id);
      // Dust the chat bot accrued for this Twitch id before the account existed.
      const claimed = await claimPendingDust('twitch', info.id.slice('twitch:'.length), user.id);
      const returnTo = safeReturnTo(saved.returnTo);
      const suffix =
        claimed > 0 ? `${returnTo.includes('?') ? '&' : '?'}dustClaimed=${claimed}` : '';
      return reply.redirect(config.webUrl + returnTo + suffix);
    },
  );

  app.get<{ Querystring: { returnTo?: string; switch?: string } }>(
    '/api/auth/google/login',
    async (req, reply) => {
      const returnTo = safeReturnTo(req.query.returnTo);
      if (!config.google.clientId) {
        return reply.code(503).send({ error: 'GOOGLE_CLIENT_ID не настроен' });
      }
      const forceSelect = req.query.switch !== undefined;
      const state = crypto.randomBytes(16).toString('hex');
      reply.setCookie(STATE_COOKIE, JSON.stringify({ state, returnTo }), {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProd,
        path: '/api/auth',
        maxAge: 600,
      });
      return reply.redirect(buildGoogleAuthorizeUrl(state, forceSelect));
    },
  );

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/google/callback',
    async (req, reply) => {
      const raw = req.cookies[STATE_COOKIE];
      const unsigned = raw ? req.unsignCookie(raw) : null;
      reply.clearCookie(STATE_COOKIE, { path: '/api/auth' });

      if (!unsigned?.valid) {
        return reply.code(400).send({ error: 'Потерян state (куки). Попробуй войти ещё раз.' });
      }
      const saved = JSON.parse(unsigned.value) as { state: string; returnTo: string };
      if (req.query.error || !req.query.code || req.query.state !== saved.state) {
        return reply
          .code(400)
          .send({ error: `Авторизация не удалась: ${req.query.error ?? 'bad state'}` });
      }

      const info = await exchangeGoogleCodeForUser(req.query.code);
      // Public login is stable: keep existing user's login, pick a free one for new users.
      const existing = await db
        .select({ login: users.login })
        .from(users)
        .where(eq(users.id, info.id))
        .get();
      const login = existing ? existing.login : await ensureUniqueLogin(info.login);
      const user = await upsertUser({ ...info, login });
      await createSession(reply, user.id);
      return reply.redirect(config.webUrl + safeReturnTo(saved.returnTo));
    },
  );

  app.get('/api/auth/me', async (req): Promise<MeResponse> => {
    const user = await getSessionUser(req);
    if (!user) return { user: null, channel: null };
    const channel = await db.select().from(channels).where(eq(channels.ownerUserId, user.id)).get();
    const owned = await db
      .select({ itemId: userCosmetics.itemId })
      .from(userCosmetics)
      .where(eq(userCosmetics.userId, user.id))
      .all();
    return {
      user: {
        id: user.id,
        login: user.login,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isFounder: user.founderSince != null,
        isAdmin: isAdmin(user.id),
        stardust: user.stardust,
        ownedCosmetics: owned.map((o) => o.itemId),
        equipped: user.equipped ?? {},
      },
      channel: channel ? { id: channel.id, overlayToken: channel.overlayToken } : null,
    };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });
}
