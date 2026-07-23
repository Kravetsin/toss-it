import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { LinkAccountCard, LinkPendingInfo, MeResponse } from '@tmw/shared';
import { db } from '../db/index';
import {
  channels,
  linkedIdentities,
  sessions,
  userCosmetics,
  users,
  type UserRow,
} from '../db/schema';
import { config } from '../config';
import {
  addIdentity,
  buildAuthorizeUrl,
  buildGoogleAuthorizeUrl,
  claimPlatformSubmissions,
  createSession,
  destroySession,
  ensureUniqueLogin,
  exchangeCodeForUser,
  exchangeGoogleCodeForUser,
  exchangeTwitchCode,
  fetchTwitchUser,
  getSessionUser,
  googleCallbackUri,
  isAdmin,
  oauthOrigin,
  requireAdmin,
  requireUser,
  resolveIdentity,
  twitchCallbackUri,
  upsertUser,
} from '../auth';
import {
  dustEarnedFor,
  messagesTotalFor,
  submissionsTotalFor,
  watchMinutesTotalFor,
} from '../level';
import { notifyNewUser } from '../notify';
import { claimPendingDust } from '../modules/twitch-chat/accrual';
import { saveBotCredentials } from '../modules/twitch-chat/token';
import type { TwitchChatModule } from '../modules/twitch-chat/index';
import type { ChannelPointsModule, RewardKind } from '../modules/channel-points/index';

export const STATE_COOKIE = 'oauth_state';
/** Pending "choose primary account" conflict, set by the link callback. */
const LINK_COOKIE = 'link_pending';
const FAKE_LOGIN_RE = /^[a-z0-9_]{2,25}$/i;
/** Manage this channel's custom rewards + redemptions — the streamer's channel-points opt-in. */
const CHANNEL_POINTS_SCOPE = 'channel:manage:redemptions';

/** OAuth state cookie payload. bot = admin's bot-connect; link = attach Twitch to session user;
 *  cp = streamer's channel-points opt-in (channelId carries which channel gets the reward). */
export interface OAuthState {
  state: string;
  returnTo: string;
  bot?: boolean;
  link?: boolean;
  cp?: boolean;
  channelId?: string;
  /** Which reward the streamer is creating with this OAuth (the first reward triggers the flow). */
  cpReward?: RewardKind;
  /** Channel-points reward cost the streamer picked (clamped when the reward is created). */
  cpCost?: number;
  /** Streamer's UI language, for the reward's title/description. */
  cpLang?: string;
}

interface LinkPending {
  twitchId: string;
  otherUserId: string;
}

/** Append query params to a relative returnTo path. */
function withParams(returnTo: string, params: Record<string, string | number>): string {
  const entries = Object.entries(params);
  if (entries.length === 0) return returnTo;
  const qs = entries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return returnTo + (returnTo.includes('?') ? '&' : '?') + qs;
}

function readLinkPending(req: FastifyRequest): LinkPending | null {
  const raw = req.cookies[LINK_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  try {
    const parsed = JSON.parse(unsigned.value) as LinkPending;
    return typeof parsed.twitchId === 'string' && typeof parsed.otherUserId === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** returnTo must be a relative path — open-redirect guard. */
function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

export interface AuthRoutesDeps {
  twitchChat: TwitchChatModule;
  channelPoints: ChannelPointsModule;
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
        let user = await resolveIdentity('fake', login);
        if (!user) {
          user = await upsertUser({
            id: `fake:${login}`,
            login,
            displayName: login,
            avatarUrl: null,
          });
          await addIdentity('fake', login, user.id);
        }
        await createSession(reply, user.id);
        return reply.redirect(oauthOrigin(req) + returnTo);
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
      return reply.redirect(buildAuthorizeUrl(state, forceVerify, '', twitchCallbackUri(req)));
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
        const tokens = await exchangeTwitchCode(req.query.code, twitchCallbackUri(req));
        const bot = await fetchTwitchUser(tokens.accessToken);
        await saveBotCredentials({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          userId: bot.id,
          login: bot.login,
        });
        deps.twitchChat.credentialsChanged();
        return reply.redirect(oauthOrigin(req) + safeReturnTo(saved.returnTo));
      }

      // Channel-points opt-in: store the streamer's token and create our app-owned reward on their
      // channel. Authorized separately (channel:manage:redemptions), so it never logs anyone in.
      if (saved.cp && saved.channelId) {
        const owner = await requireUser(req, reply);
        if (!owner) return;
        const channel = await db
          .select()
          .from(channels)
          .where(and(eq(channels.id, saved.channelId), eq(channels.ownerUserId, owner.id)))
          .get();
        const returnToCp = safeReturnTo(saved.returnTo);
        if (!channel) {
          return reply.redirect(
            oauthOrigin(req) + withParams(returnToCp, { cpError: 'not_owner' }),
          );
        }
        const tokens = await exchangeTwitchCode(req.query.code, twitchCallbackUri(req));
        const broadcaster = await fetchTwitchUser(tokens.accessToken);
        const result = await deps.channelPoints.connectChannel({
          channelId: channel.id,
          broadcasterId: broadcaster.id,
          creds: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
          externalName: broadcaster.displayName,
          reward: saved.cpReward,
          cost: saved.cpCost,
          lang: saved.cpLang,
        });
        return reply.redirect(
          oauthOrigin(req) +
            withParams(
              returnToCp,
              result.ok ? { cp: 'connected' } : { cpError: result.error ?? 'failed' },
            ),
        );
      }

      const info = await exchangeCodeForUser(req.query.code, twitchCallbackUri(req));
      const twitchId = info.id.slice('twitch:'.length);
      const returnTo = safeReturnTo(saved.returnTo);

      // Link flow: attach this Twitch identity to the logged-in (Google) account.
      if (saved.link) {
        const current = await requireUser(req, reply);
        if (!current) return;
        const owner = await resolveIdentity('twitch', twitchId);
        if (!owner) {
          await addIdentity('twitch', twitchId, current.id);
          await claimPlatformSubmissions('twitch', twitchId, current.id);
          const claimed = await claimPendingDust('twitch', twitchId, current.id);
          return reply.redirect(
            oauthOrigin(req) +
              withParams(
                returnTo,
                claimed > 0 ? { twitchLinked: 1, dustClaimed: claimed } : { twitchLinked: 1 },
              ),
          );
        }
        if (owner.id === current.id) {
          return reply.redirect(oauthOrigin(req) + withParams(returnTo, { twitchLinked: 1 }));
        }
        // This Twitch already opens another account — let the person choose the primary.
        reply.setCookie(
          LINK_COOKIE,
          JSON.stringify({ twitchId, otherUserId: owner.id } satisfies LinkPending),
          {
            signed: true,
            httpOnly: true,
            sameSite: 'lax',
            secure: config.isProd,
            path: '/api/auth',
            maxAge: 600,
          },
        );
        return reply.redirect(oauthOrigin(req) + '/link/confirm');
      }

      let user = await resolveIdentity('twitch', twitchId);
      if (!user) {
        user = await upsertUser(info);
        await addIdentity('twitch', twitchId, user.id);
        notifyNewUser(user, 'twitch');
      } else if (user.id === info.id) {
        // Native login refreshes the profile; a linked login must not touch it.
        user = await upsertUser(info);
      }
      await createSession(reply, user.id);
      // Dust the chat bot accrued for this Twitch id before the account existed, and the sends
      // (channel-points redemptions) it made anonymously — both only reachable by the platform id.
      await claimPlatformSubmissions('twitch', twitchId, user.id);
      const claimed = await claimPendingDust('twitch', twitchId, user.id);
      return reply.redirect(
        oauthOrigin(req) + withParams(returnTo, claimed > 0 ? { dustClaimed: claimed } : {}),
      );
    },
  );

  /** Attach a Twitch identity to the current session's account (shop banner CTA). */
  app.get<{ Querystring: { returnTo?: string } }>('/api/auth/link/twitch', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    if (!config.twitch.clientId) {
      return reply.code(503).send({ error: 'TWITCH_CLIENT_ID не настроен' });
    }
    const returnTo = safeReturnTo(req.query.returnTo);
    const state = crypto.randomBytes(16).toString('hex');
    const payload: OAuthState = { state, returnTo, link: true };
    reply.setCookie(STATE_COOKIE, JSON.stringify(payload), {
      signed: true,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      path: '/api/auth',
      maxAge: 600,
    });
    // force_verify: the person must pick WHICH Twitch to attach, not a silent session.
    return reply.redirect(buildAuthorizeUrl(state, true, '', twitchCallbackUri(req)));
  });

  /** Data for the /link/confirm chooser page. */
  app.get('/api/auth/link/pending', async (req, reply): Promise<LinkPendingInfo | undefined> => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const pending = readLinkPending(req);
    if (!pending) {
      return reply.code(404).send({ error: 'Нет ожидающей привязки' });
    }
    const other = await db.select().from(users).where(eq(users.id, pending.otherUserId)).get();
    if (!other) {
      reply.clearCookie(LINK_COOKIE, { path: '/api/auth' });
      return reply.code(404).send({ error: 'Аккаунт не найден' });
    }
    const card = async (u: UserRow): Promise<LinkAccountCard> => ({
      login: u.login,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      stardust: u.stardust,
      cosmetics:
        (
          await db
            .select({ n: sql<number>`count(*)` })
            .from(userCosmetics)
            .where(eq(userCosmetics.userId, u.id))
            .get()
        )?.n ?? 0,
      ownsChannel: !!(await db
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.ownerUserId, u.id))
        .get()),
    });
    return { current: await card(user), other: await card(other) };
  });

  /**
   * The primary-account choice. Nothing is merged or transferred: identities are
   * repointed at the chosen account, the losing account just becomes unreachable.
   */
  app.post<{ Body: { primary?: string } | null }>('/api/auth/link/resolve', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const pending = readLinkPending(req);
    if (!pending) {
      return reply.code(400).send({ error: 'Привязка истекла — начните заново' });
    }
    const primary = req.body?.primary;
    if (primary !== 'current' && primary !== 'other') {
      return reply.code(400).send({ error: 'primary: current | other' });
    }
    reply.clearCookie(LINK_COOKIE, { path: '/api/auth' });

    if (primary === 'current') {
      await db
        .update(linkedIdentities)
        .set({ userId: user.id })
        .where(eq(linkedIdentities.userId, pending.otherUserId));
      await db.delete(sessions).where(eq(sessions.userId, pending.otherUserId));
      await claimPlatformSubmissions('twitch', pending.twitchId, user.id);
      await claimPendingDust('twitch', pending.twitchId, user.id);
      return { ok: true, switched: false };
    }
    // The other (Twitch-native) account wins: move this account's doors there and re-login.
    await db
      .update(linkedIdentities)
      .set({ userId: pending.otherUserId })
      .where(eq(linkedIdentities.userId, user.id));
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    await claimPlatformSubmissions('twitch', pending.twitchId, pending.otherUserId);
    await claimPendingDust('twitch', pending.twitchId, pending.otherUserId);
    await createSession(reply, pending.otherUserId);
    return { ok: true, switched: true };
  });

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
      return reply.redirect(buildGoogleAuthorizeUrl(state, forceSelect, googleCallbackUri(req)));
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

      const info = await exchangeGoogleCodeForUser(req.query.code, googleCallbackUri(req));
      const sub = info.id.slice('google:'.length);
      let user = await resolveIdentity('google', sub);
      if (!user) {
        // Public login is stable: pick a free one once, at signup.
        const login = await ensureUniqueLogin(info.login);
        user = await upsertUser({ ...info, login });
        await addIdentity('google', sub, user.id);
        notifyNewUser(user, 'google');
      } else if (user.id === info.id) {
        // Native login refreshes name/avatar but keeps the site-wide login handle.
        user = await upsertUser({ ...info, login: user.login });
      }
      await createSession(reply, user.id);
      return reply.redirect(oauthOrigin(req) + safeReturnTo(saved.returnTo));
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
    const twitchIdentity = await db
      .select({ providerId: linkedIdentities.providerId })
      .from(linkedIdentities)
      .where(and(eq(linkedIdentities.userId, user.id), eq(linkedIdentities.provider, 'twitch')))
      .get();
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
        messagesTotal: await messagesTotalFor(user.id),
        watchMinutesTotal: await watchMinutesTotalFor(user.id),
        submissionsTotal: await submissionsTotalFor(user.id),
        dustEarnedTotal: await dustEarnedFor(user.id),
        equipped: user.equipped ?? {},
        hasTwitch: !!twitchIdentity,
      },
      channel: channel ? { id: channel.id, overlayToken: channel.overlayToken } : null,
    };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  /** Start the channel-points opt-in: a separate OAuth for channel:manage:redemptions. `reward`
   *  picks which reward this flow creates (the streamer's first reward; the rest reuse the token). */
  app.get<{ Querystring: { returnTo?: string; reward?: string; cost?: string; lang?: string } }>(
    '/api/channel-points/connect',
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return;
      if (!config.twitch.clientId) {
        return reply.code(503).send({ error: 'TWITCH_CLIENT_ID не настроен' });
      }
      const channel = await db
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.ownerUserId, user.id))
        .get();
      if (!channel) return reply.code(400).send({ error: 'Нет канала' });
      const returnTo = safeReturnTo(req.query.returnTo);
      const cpReward: RewardKind = req.query.reward === 'youtube' ? 'youtube' : 'stardust';
      const cpCost = req.query.cost ? Number(req.query.cost) : undefined;
      const cpLang = req.query.lang;
      const state = crypto.randomBytes(16).toString('hex');
      const payload: OAuthState = {
        state,
        returnTo,
        cp: true,
        channelId: channel.id,
        cpReward,
        cpCost,
        cpLang,
      };
      reply.setCookie(STATE_COOKIE, JSON.stringify(payload), {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        secure: config.isProd,
        path: '/api/auth',
        maxAge: 600,
      });
      // force_verify so the streamer explicitly picks the channel account the reward lands on.
      return reply.redirect(
        buildAuthorizeUrl(state, true, CHANNEL_POINTS_SCOPE, twitchCallbackUri(req)),
      );
    },
  );

  app.get('/api/channel-points/status', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const channel = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.ownerUserId, user.id))
      .get();
    if (!channel)
      return { connected: false, externalName: null, hasStardust: false, hasYoutube: false };
    return deps.channelPoints.status(channel.id);
  });

  app.post('/api/channel-points/disconnect', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const channel = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.ownerUserId, user.id))
      .get();
    if (channel) await deps.channelPoints.disconnect(channel.id);
    return { ok: true };
  });

  /** Add the stardust reward to the caller's already-connected channel. */
  app.post<{ Body: { cost?: number; lang?: string } | null }>(
    '/api/channel-points/stardust',
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return;
      const channel = await db
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.ownerUserId, user.id))
        .get();
      if (!channel) return reply.code(400).send({ error: 'Нет канала' });
      const result = await deps.channelPoints.addStardustReward(channel.id, {
        cost: req.body?.cost,
        lang: req.body?.lang,
      });
      if (!result.ok) return reply.code(400).send({ error: result.error ?? 'failed' });
      return { ok: true };
    },
  );

  app.delete('/api/channel-points/stardust', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const channel = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.ownerUserId, user.id))
      .get();
    if (channel) await deps.channelPoints.removeStardustReward(channel.id);
    return { ok: true };
  });

  /** Add the YouTube-request reward to the caller's already-connected channel. */
  app.post<{ Body: { cost?: number; lang?: string } | null }>(
    '/api/channel-points/youtube',
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return;
      const channel = await db
        .select({ id: channels.id })
        .from(channels)
        .where(eq(channels.ownerUserId, user.id))
        .get();
      if (!channel) return reply.code(400).send({ error: 'Нет канала' });
      const result = await deps.channelPoints.addYoutubeReward(channel.id, {
        cost: req.body?.cost,
        lang: req.body?.lang,
      });
      if (!result.ok) return reply.code(400).send({ error: result.error ?? 'failed' });
      return { ok: true };
    },
  );

  app.delete('/api/channel-points/youtube', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const channel = await db
      .select({ id: channels.id })
      .from(channels)
      .where(eq(channels.ownerUserId, user.id))
      .get();
    if (channel) await deps.channelPoints.removeYoutubeReward(channel.id);
    return { ok: true };
  });

  /** Admin diagnostic: live runtime state of the channel-points module (is the socket up, which
   *  channels are subscribed). Read this when redemptions aren't being processed. */
  app.get('/api/channel-points/debug', async (req, reply) => {
    const user = await requireAdmin(req, reply);
    if (!user) return;
    return deps.channelPoints.debugState();
  });
}
