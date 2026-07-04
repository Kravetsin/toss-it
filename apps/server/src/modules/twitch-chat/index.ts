import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from '../../db/index';
import { channels, linkedIdentities } from '../../db/schema';
import { config } from '../../config';
import { EventSubClient } from './eventsub';
import { awardChatDust } from './accrual';
import { loadBotCredentials, refreshBotCredentials, type BotCredentials } from './token';

const RECONCILE_INTERVAL_MS = 5 * 60_000;
const MODERATED_CHANNELS_URL = 'https://api.twitch.tv/helix/moderation/channels';

export interface TwitchChatDeps {
  /** Live signal: the streamer's OBS overlay is connected (platform-agnostic). */
  overlayCount(channelId: string): number;
  log: FastifyBaseLogger;
}

export interface TwitchChatModule {
  /** Admin (re)connected the bot account — reload credentials and restart. */
  credentialsChanged(): void;
  status(): { connected: boolean; login: string | null };
  /** Is the bot actually subscribed to this channel's chat right now? */
  readsChannel(channelId: string): boolean;
  stop(): void;
}

/**
 * Optional Twitch module: awards stardust for chat messages via EventSub.
 * Dormant (no sockets, no timers) unless bot credentials exist in app_meta —
 * the core app never depends on it.
 */
export function createTwitchChatModule(deps: TwitchChatDeps): TwitchChatModule {
  let creds: BotCredentials | null = null;
  let client: EventSubClient | null = null;
  let reconcileTimer: NodeJS.Timeout | null = null;
  /** broadcaster twitch id -> channel id, for enabled channels only. */
  let channelByBroadcaster = new Map<string, string>();

  async function getAccessToken(refresh = false): Promise<string | null> {
    if (!creds) return null;
    if (refresh) {
      const next = await refreshBotCredentials(creds);
      if (!next) {
        deps.log.error('twitch-chat: bot refresh token invalid — reconnect the bot via admin');
        shutdownClient();
        creds = null;
        return null;
      }
      creds = next;
    }
    return creds.accessToken;
  }

  function onChatMessage(ev: { broadcasterId: string; chatterId: string }): void {
    const channelId = channelByBroadcaster.get(ev.broadcasterId);
    if (!channelId) return;
    if (ev.chatterId === ev.broadcasterId) return; // own chat earns nothing (like sends)
    if (deps.overlayCount(channelId) === 0) return; // accrue only while live
    awardChatDust(ev.chatterId).catch((err) =>
      deps.log.warn({ err }, 'twitch-chat: accrual failed'),
    );
  }

  /** All channels the bot moderates on Twitch (the streamer's /mod is the only opt-in). */
  async function fetchModeratedBroadcasterIds(): Promise<Set<string> | null> {
    if (!creds) return null;
    const ids = new Set<string>();
    let cursor: string | undefined;
    do {
      const url = new URL(MODERATED_CHANNELS_URL);
      url.searchParams.set('user_id', creds.userId);
      url.searchParams.set('first', '100');
      if (cursor) url.searchParams.set('after', cursor);
      let res: Response | null = null;
      for (const refresh of [false, true]) {
        const token = await getAccessToken(refresh);
        if (!token) return null;
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, 'Client-Id': config.twitch.clientId },
        });
        if (res.status !== 401) break;
      }
      if (!res?.ok) {
        // Persistent 401 here despite a fresh token = missing scope on an old bot token.
        deps.log.warn(
          { status: res?.status },
          'twitch-chat: moderated channels fetch failed — reconnect the bot if it predates the user:read:moderated_channels scope',
        );
        return null;
      }
      const body = (await res.json()) as {
        data?: { broadcaster_id: string }[];
        pagination?: { cursor?: string };
      };
      for (const c of body.data ?? []) ids.add(c.broadcaster_id);
      cursor = body.pagination?.cursor;
    } while (cursor);
    return ids;
  }

  async function reconcile(): Promise<void> {
    if (!client) return;
    const moderated = await fetchModeratedBroadcasterIds();
    if (!moderated) return; // transient failure — keep the current subscription set
    // Owner's twitch identity may be native OR linked to a Google account.
    const rows = await db
      .select({ id: channels.id, broadcasterId: linkedIdentities.providerId })
      .from(channels)
      .innerJoin(
        linkedIdentities,
        and(
          eq(linkedIdentities.userId, channels.ownerUserId),
          eq(linkedIdentities.provider, 'twitch'),
        ),
      )
      .all();
    channelByBroadcaster = new Map(
      rows
        .map((r) => [r.broadcasterId, r.id] as const)
        .filter(([broadcasterId]) => moderated.has(broadcasterId)),
    );
    client.setBroadcasters(new Set(channelByBroadcaster.keys()));
  }

  function shutdownClient(): void {
    client?.stop();
    client = null;
    if (reconcileTimer) clearInterval(reconcileTimer);
    reconcileTimer = null;
  }

  async function boot(): Promise<void> {
    if (!config.twitch.clientId) return;
    creds = await loadBotCredentials();
    if (!creds) return; // module stays dormant
    client = new EventSubClient({
      botUserId: creds.userId,
      getAccessToken,
      onChatMessage,
      log: deps.log,
    });
    client.start();
    await reconcile();
    reconcileTimer = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
    deps.log.info({ bot: creds.login }, 'twitch-chat: module started');
  }

  void boot().catch((err) => deps.log.error({ err }, 'twitch-chat: boot failed'));

  return {
    credentialsChanged() {
      shutdownClient();
      void boot().catch((err) => deps.log.error({ err }, 'twitch-chat: restart failed'));
    },
    status() {
      return { connected: client != null && creds != null, login: creds?.login ?? null };
    },
    readsChannel(channelId) {
      if (!client) return false;
      for (const [broadcasterId, chId] of channelByBroadcaster) {
        if (chId === channelId) return client.isSubscribed(broadcasterId);
      }
      return false;
    },
    stop: shutdownClient,
  };
}
