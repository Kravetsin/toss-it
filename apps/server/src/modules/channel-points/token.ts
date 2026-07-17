import { config } from '../../config';

/** A streamer's Twitch OAuth tokens for their channel-points reward (channel:manage:redemptions). */
export interface StreamerCreds {
  accessToken: string;
  refreshToken: string;
}

/**
 * Refresh a streamer's access token. Twitch rotates refresh tokens, so the caller must persist the
 * returned pair. null = the refresh token was revoked/expired — the streamer must reconnect.
 */
export async function refreshStreamerCreds(creds: StreamerCreds): Promise<StreamerCreds | null> {
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
  if (!res.ok) throw new Error(`channel-points token refresh failed: ${res.status}`);
  const body = (await res.json()) as { access_token: string; refresh_token?: string };
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? creds.refreshToken,
  };
}
