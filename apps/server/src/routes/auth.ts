import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { MeResponse } from '@tmw/shared';
import { db } from '../db/index';
import { channels, users } from '../db/schema';
import { config } from '../config';
import {
  buildAuthorizeUrl,
  buildGoogleAuthorizeUrl,
  createSession,
  destroySession,
  ensureUniqueLogin,
  exchangeCodeForUser,
  exchangeGoogleCodeForUser,
  getSessionUser,
  isAdmin,
  upsertUser,
} from '../auth';

const STATE_COOKIE = 'oauth_state';
const FAKE_LOGIN_RE = /^[a-z0-9_]{2,25}$/i;

/** returnTo всегда относительный путь — защита от open redirect. */
function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { fake?: string; returnTo?: string; switch?: string } }>(
    '/api/auth/login',
    async (req, reply) => {
      const returnTo = safeReturnTo(req.query.returnTo);
      // ?switch=1 → принудительно показать экран Twitch для смены аккаунта.
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
      const saved = JSON.parse(unsigned.value) as { state: string; returnTo: string };
      if (req.query.error || !req.query.code || req.query.state !== saved.state) {
        return reply
          .code(400)
          .send({ error: `Авторизация не удалась: ${req.query.error ?? 'bad state'}` });
      }

      const info = await exchangeCodeForUser(req.query.code);
      const user = await upsertUser(info);
      await createSession(reply, user.id);
      return reply.redirect(config.webUrl + safeReturnTo(saved.returnTo));
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
      // Публичный login стабилен: у существующего пользователя не меняем, новому — подбираем свободный.
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
    const channel = await db
      .select()
      .from(channels)
      .where(eq(channels.ownerUserId, user.id))
      .get();
    return {
      user: {
        id: user.id,
        login: user.login,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        isFounder: user.founderSince != null,
        isAdmin: isAdmin(user.id),
      },
      channel: channel ? { id: channel.id, overlayToken: channel.overlayToken } : null,
    };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });
}
