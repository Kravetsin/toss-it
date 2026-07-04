import { eq } from 'drizzle-orm';
import { db } from '../../db/index';
import { appMeta } from '../../db/schema';
import { config } from '../../config';

/** Stored in app_meta, not env: Twitch rotates refresh tokens, so they must be persisted. */
const META_KEY = 'twitch_bot_token';

export interface BotCredentials {
  accessToken: string;
  refreshToken: string;
  /** Raw numeric Twitch id of the bot account. */
  userId: string;
  login: string;
}

export async function loadBotCredentials(): Promise<BotCredentials | null> {
  const row = await db.select().from(appMeta).where(eq(appMeta.key, META_KEY)).get();
  if (!row) return null;
  try {
    return JSON.parse(row.value) as BotCredentials;
  } catch {
    return null;
  }
}

export async function saveBotCredentials(creds: BotCredentials): Promise<void> {
  const value = JSON.stringify(creds);
  await db
    .insert(appMeta)
    .values({ key: META_KEY, value })
    .onConflictDoUpdate({ target: appMeta.key, set: { value } });
}

/**
 * Refresh the access token, persisting the (possibly rotated) refresh token.
 * null = refresh token revoked/expired: the admin must reconnect the bot.
 */
export async function refreshBotCredentials(creds: BotCredentials): Promise<BotCredentials | null> {
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.twitch.clientId,
      client_secret: config.twitch.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
    }),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`twitch bot token refresh failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; refresh_token?: string };
  const next: BotCredentials = {
    ...creds,
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? creds.refreshToken,
  };
  await saveBotCredentials(next);
  return next;
}
