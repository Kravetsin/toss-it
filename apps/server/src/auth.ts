import crypto from 'node:crypto';
import { eq, lt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from './db/index';
import { sessions, users, type UserRow } from './db/schema';
import { config } from './config';

const SESSION_COOKIE = 'sid';

/** Normalized user profile from any OAuth provider (Twitch/Google). */
export interface OAuthUserInfo {
  id: string;
  login: string;
  displayName: string;
  avatarUrl: string | null;
}

export function buildAuthorizeUrl(state: string, forceVerify = false): string {
  const params = new URLSearchParams({
    client_id: config.twitch.clientId,
    redirect_uri: config.twitch.redirectUri,
    response_type: 'code',
    scope: '', // identity only
    state,
  });
  // force_verify shows the auth screen even with a live session; otherwise
  // Twitch silently re-logs the same account. Needed for "switch account".
  if (forceVerify) params.set('force_verify', 'true');
  return `https://id.twitch.tv/oauth2/authorize?${params}`;
}

/** Exchange authorization code -> access token -> Helix user data. */
export async function exchangeCodeForUser(code: string): Promise<OAuthUserInfo> {
  const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.twitch.clientId,
      client_secret: config.twitch.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.twitch.redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`twitch token exchange failed: ${tokenRes.status}`);
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const userRes = await fetch('https://api.twitch.tv/helix/users', {
    headers: {
      Authorization: `Bearer ${access_token}`,
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
    id: `twitch:${u.id}`,
    login: u.login,
    displayName: u.display_name,
    avatarUrl: u.profile_image_url || null,
  };
}

/** Google OAuth 2.0 (OpenID Connect): same authorization-code flow as Twitch. */
export function buildGoogleAuthorizeUrl(state: string, forceSelect = false): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
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
export async function exchangeGoogleCodeForUser(code: string): Promise<OAuthUserInfo> {
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.google.redirectUri,
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
