import crypto from 'node:crypto';
import { and, eq, isNull, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from './db/index';
import { linkedIdentities, sessions, submissions, users, type UserRow } from './db/schema';
import { config } from './config';

const SESSION_COOKIE = 'sid';

/** Normalized user profile from any OAuth provider (Twitch/Google). */
export interface OAuthUserInfo {
  id: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * External origin the user is browsing. Behind Cloudflare the Host header is the real
 * domain (and only configured tunnel hostnames ever reach us), so during the .win→.org
 * migration each domain round-trips OAuth on its own origin — the state cookie is
 * domain-scoped and must survive the callback. Dev keeps the split SPA/API ports.
 */
export function oauthOrigin(req: FastifyRequest): string {
  if (config.isProd && req.headers.host) return `https://${req.headers.host}`;
  return config.webUrl;
}
export function twitchCallbackUri(req: FastifyRequest): string {
  return config.isProd && req.headers.host
    ? `https://${req.headers.host}/api/auth/callback`
    : config.twitch.redirectUri;
}
export function googleCallbackUri(req: FastifyRequest): string {
  return config.isProd && req.headers.host
    ? `https://${req.headers.host}/api/auth/google/callback`
    : config.google.redirectUri;
}

export function buildAuthorizeUrl(
  state: string,
  forceVerify = false,
  scope = '',
  redirectUri: string = config.twitch.redirectUri,
): string {
  const params = new URLSearchParams({
    client_id: config.twitch.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope, // login uses '' (identity only); bot connect asks for user:read:chat
    state,
  });
  // force_verify shows the auth screen even with a live session; otherwise
  // Twitch silently re-logs the same account. Needed for "switch account".
  if (forceVerify) params.set('force_verify', 'true');
  return `https://id.twitch.tv/oauth2/authorize?${params}`;
}

/** Exchange authorization code -> tokens. refreshToken matters for the chat bot module. */
export async function exchangeTwitchCode(
  code: string,
  redirectUri: string = config.twitch.redirectUri,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.twitch.clientId,
      client_secret: config.twitch.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`twitch token exchange failed: ${tokenRes.status}`);
  }
  const body = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  return { accessToken: body.access_token, refreshToken: body.refresh_token ?? '' };
}

/** Helix profile of the token's owner. id is the raw numeric Twitch id (no prefix). */
export async function fetchTwitchUser(
  accessToken: string,
): Promise<{ id: string; login: string; displayName: string; avatarUrl: string | null }> {
  const userRes = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': config.twitch.clientId,
    },
  });
  if (!userRes.ok) {
    throw new Error(`twitch get user failed: ${userRes.status}`);
  }
  const body = (await userRes.json()) as {
    data: { id: string; login: string; display_name: string; profile_image_url: string }[];
  };
  const u = body.data[0];
  if (!u) throw new Error('twitch returned no user');
  return {
    id: u.id,
    login: u.login,
    displayName: u.display_name,
    avatarUrl: u.profile_image_url || null,
  };
}

/** Exchange authorization code -> access token -> Helix user data. */
export async function exchangeCodeForUser(
  code: string,
  redirectUri: string = config.twitch.redirectUri,
): Promise<OAuthUserInfo> {
  const { accessToken } = await exchangeTwitchCode(code, redirectUri);
  const u = await fetchTwitchUser(accessToken);
  return {
    id: `twitch:${u.id}`,
    login: u.login,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
  };
}

/** Google OAuth 2.0 (OpenID Connect): same authorization-code flow as Twitch. */
export function buildGoogleAuthorizeUrl(
  state: string,
  forceSelect = false,
  redirectUri: string = config.google.redirectUri,
): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
  });
  // Show account picker (analogous to Twitch force_verify) for "switch account".
  if (forceSelect) params.set('prompt', 'select_account');
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Exchange code -> token -> OpenID userinfo profile. id is google:<sub>. */
export async function exchangeGoogleCodeForUser(
  code: string,
  redirectUri: string = config.google.redirectUri,
): Promise<OAuthUserInfo> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`google token exchange failed: ${tokenRes.status}`);
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) {
    throw new Error(`google userinfo failed: ${userRes.status}`);
  }
  const u = (await userRes.json()) as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  // Derive public login from email local-part; never expose the email itself.
  const base = (u.email?.split('@')[0] ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return {
    id: `google:${u.sub}`,
    login: base || 'user',
    displayName: u.name || base || 'user',
    avatarUrl: u.picture || null,
  };
}

/** Find a free public login from a desired base (Google has no Twitch-like handle). */
export async function ensureUniqueLogin(base: string): Promise<string> {
  const clean =
    (base || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20) || 'user';
  let candidate = clean;
  for (let i = 0; i < 6; i++) {
    const taken = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.login, candidate))
      .get();
    if (!taken) return candidate;
    candidate = `${clean}_${crypto.randomBytes(2).toString('hex')}`;
  }
  return `${clean}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Which user does this provider identity open? Identities are the login source
 * of truth: linking repoints them, so any provider can open any account.
 * Self-heals legacy user rows that predate the identities backfill.
 */
export async function resolveIdentity(
  provider: string,
  providerId: string,
): Promise<UserRow | null> {
  const row = await db
    .select({ user: users })
    .from(linkedIdentities)
    .innerJoin(users, eq(users.id, linkedIdentities.userId))
    .where(
      and(eq(linkedIdentities.provider, provider), eq(linkedIdentities.providerId, providerId)),
    )
    .get();
  if (row) return row.user;
  const legacy = await db
    .select()
    .from(users)
    .where(eq(users.id, `${provider}:${providerId}`))
    .get();
  if (legacy) {
    await addIdentity(provider, providerId, legacy.id);
    return legacy;
  }
  return null;
}

export async function addIdentity(
  provider: string,
  providerId: string,
  userId: string,
): Promise<void> {
  await db
    .insert(linkedIdentities)
    .values({ provider, providerId, userId, createdAt: new Date() })
    .onConflictDoNothing();
  await claimPlatformSubmissions(provider, providerId, userId);
}

/**
 * Re-attribute submissions this platform identity made before the account existed (channel-points
 * redemptions carry only the platform id). Every board and the XP curve key on senderUserId, so
 * without this an unregistered redeemer's sends stay invisible even after they log in — the same
 * "claim on link" rule pending dust already follows.
 */
async function claimPlatformSubmissions(
  provider: string,
  providerId: string,
  userId: string,
): Promise<void> {
  await db
    .update(submissions)
    .set({ senderUserId: userId })
    .where(
      and(
        isNull(submissions.senderUserId),
        eq(submissions.senderPlatform, provider),
        eq(submissions.senderPlatformUserId, providerId),
      ),
    );
}

export async function upsertUser(info: OAuthUserInfo): Promise<UserRow> {
  const now = new Date();
  await db
    .insert(users)
    .values({
      id: info.id,
      login: info.login,
      displayName: info.displayName,
      avatarUrl: info.avatarUrl,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { login: info.login, displayName: info.displayName, avatarUrl: info.avatarUrl },
    });
  const row = await db.select().from(users).where(eq(users.id, info.id)).get();
  return row!;
}

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const id = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  await db.insert(sessions).values({
    id,
    userId,
    createdAt: now,
    expiresAt: new Date(now.getTime() + config.sessionTtlMs),
  });
  // Opportunistically purge expired sessions; cheap substitute for a cron job.
  await db.delete(sessions).where(lt(sessions.expiresAt, now));

  reply.setCookie(SESSION_COOKIE, id, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sid = readSessionId(req);
  if (sid) await db.delete(sessions).where(eq(sessions.id, sid));
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

export async function getSessionUser(req: FastifyRequest): Promise<UserRow | null> {
  const sid = readSessionId(req);
  if (!sid) return null;
  const row = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sid))
    .get();
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row.user;
}

/** 401 if not logged in. For routes that require a user. */
export async function requireUser(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<UserRow | null> {
  const user = await getSessionUser(req);
  if (!user) {
    void reply.code(401).send({ error: 'Требуется вход' });
    return null;
  }
  return user;
}

/** Whether the user is in the admin list (ADMIN_USER_IDS). */
export function isAdmin(userId: string): boolean {
  return config.adminUserIds.includes(userId);
}

/** 401 if not logged in, 403 if logged in but not admin. For admin routes. */
export async function requireAdmin(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<UserRow | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (!isAdmin(user.id)) {
    void reply.code(403).send({ error: 'Недостаточно прав' });
    return null;
  }
  return user;
}

function readSessionId(req: FastifyRequest): string | null {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return null;
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid ? unsigned.value : null;
}

/**
 * Resolve user from a raw Cookie header (for socket.io, which has no FastifyRequest).
 * Pass `unsignCookie` from the Fastify instance (`app.unsignCookie`) for the same secret.
 */
export async function getUserFromCookieHeader(
  cookieHeader: string | undefined,
  unsignCookie: (value: string) => { valid: boolean; value: string | null },
): Promise<UserRow | null> {
  if (!cookieHeader) return null;
  let raw: string | undefined;
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    if (pair.slice(0, eq).trim() === SESSION_COOKIE) {
      try {
        raw = decodeURIComponent(pair.slice(eq + 1).trim());
      } catch {
        return null; // malformed URL-encoding in cookie -> treat as not logged in
      }
      break;
    }
  }
  if (!raw) return null;
  const unsigned = unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return null;
  const row = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, unsigned.value))
    .get();
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row.user;
}
