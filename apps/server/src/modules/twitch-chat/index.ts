import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { ChatFragment, EquippedCosmetics } from '@tmw/shared';
import { db } from '../../db/index';
import { channels, leaderboardExclusions, linkedIdentities, users } from '../../db/schema';
import { config } from '../../config';
import { roomOf, type RealtimeServer } from '../../playback';
import { EventSubClient } from './eventsub';
import { awardChatDust } from './accrual';
import { bumpMessage, bumpWatch, flushActivity } from './stats';
import { loadBotCredentials, refreshBotCredentials, type BotCredentials } from './token';

const RECONCILE_INTERVAL_MS = 5 * 60_000;
const STATS_FLUSH_MS = 30_000;
/** Watch-time granularity: +1 min per poll. Twitch's chatters list lags a couple of
 *  minutes on join/leave, so this only blurs session edges, not the middle. */
const WATCH_POLL_MS = 60_000;
const MODERATED_CHANNELS_URL = 'https://api.twitch.tv/helix/moderation/channels';
const CHATTERS_URL = 'https://api.twitch.tv/helix/chat/chatters';
const COSMETICS_TTL_MS = 60_000;

export interface TwitchChatDeps {
  /** Live signal: the streamer's OBS overlay is connected (platform-agnostic). */
  overlayCount(channelId: string): number;
  /** Emit chat events to a channel's overlay sockets. */
  io: RealtimeServer;
  log: FastifyBaseLogger;
}

export interface TwitchChatModule {
  /** Admin (re)connected the bot account — reload credentials and restart. */
  credentialsChanged(): void;
  status(): { connected: boolean; login: string | null };
  /** Is the bot actually subscribed to this channel's chat right now? */
  readsChannel(channelId: string): boolean;
  /** Admin edited the leaderboard exclusions — refresh the collection guard now. */
  reloadExclusions(): void;
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
  let statsFlushTimer: NodeJS.Timeout | null = null;
  let watchPollTimer: NodeJS.Timeout | null = null;
  /** broadcaster twitch id -> channel id, for enabled channels only. */
  let channelByBroadcaster = new Map<string, string>();
  /** Excluded twitch logins (bots) — skip their messages entirely. Refreshed on reconcile. */
  let excludedLogins = new Set<string>();
  /** Channel ids whose streamer left the chat overlay enabled. Refreshed on reconcile. */
  let chatEnabledChannels = new Set<string>();
  /** twitch id -> Tossit cosmetics, short-lived cache (chat volume; avoid a DB read per msg). */
  const cosmeticsCache = new Map<
    string,
    { cosmetics: EquippedCosmetics | null; isFounder: boolean; at: number }
  >();

  async function loadExclusions(): Promise<void> {
    const rows = await db.select({ login: leaderboardExclusions.login }).from(leaderboardExclusions).all();
    excludedLogins = new Set(rows.map((r) => r.login));
  }

  /** Author's equipped Tossit cosmetics by twitch id (null if not linked), cached ~60s. */
  async function lookupCosmetics(
    twitchId: string,
  ): Promise<{ cosmetics: EquippedCosmetics | null; isFounder: boolean }> {
    const hit = cosmeticsCache.get(twitchId);
    if (hit && Date.now() - hit.at < COSMETICS_TTL_MS) return hit;
    const row = await db
      .select({ equipped: users.equipped, founderSince: users.founderSince })
      .from(linkedIdentities)
      .innerJoin(users, eq(users.id, linkedIdentities.userId))
      .where(
        and(eq(linkedIdentities.provider, 'twitch'), eq(linkedIdentities.providerId, twitchId)),
      )
      .get();
    const value = {
      cosmetics: row?.equipped ?? null,
      isFounder: row?.founderSince != null,
      at: Date.now(),
    };
    cosmeticsCache.set(twitchId, value);
    return value;
  }

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

  function onChatMessage(ev: {
    broadcasterId: string;
    chatterId: string;
    chatterLogin: string;
    chatterName: string;
    messageId: string;
    color: string | null;
    fragments: ChatFragment[];
  }): void {
    const channelId = channelByBroadcaster.get(ev.broadcasterId);
    if (!channelId) return;
    const excluded = excludedLogins.has(ev.chatterLogin);
    const live = deps.overlayCount(channelId) > 0;

    // Accrual: not the broadcaster's own chat, not an excluded bot, only while live.
    if (!excluded && ev.chatterId !== ev.broadcasterId && live) {
      bumpMessage(channelId, ev.chatterId, ev.chatterLogin, ev.chatterName);
      awardChatDust(ev.chatterId).catch((err) =>
        deps.log.warn({ err }, 'twitch-chat: accrual failed'),
      );
    }

    // Chat overlay: show everyone INCLUDING the streamer (but not excluded bots),
    // only when the channel enabled it and an overlay is actually listening.
    if (excluded || !chatEnabledChannels.has(channelId) || !live) return;
    void lookupCosmetics(ev.chatterId)
      .then(({ cosmetics, isFounder }) => {
        deps.io.to(roomOf(channelId)).emit('chat:message', {
          id: ev.messageId,
          userId: ev.chatterId,
          name: ev.chatterName,
          twitchColor: ev.color,
          cosmetics,
          isFounder,
          fragments: ev.fragments,
        });
      })
      .catch((err) => deps.log.warn({ err }, 'twitch-chat: chat emit failed'));
  }

  function forwardToOverlay(broadcasterId: string, emit: (channelId: string) => void): void {
    const channelId = channelByBroadcaster.get(broadcasterId);
    if (channelId) emit(channelId);
  }

  /** Helix GET with the bot token; retries once through a token refresh on 401. */
  async function helixGet(url: URL): Promise<Response | null> {
    let res: Response | null = null;
    for (const refresh of [false, true]) {
      const token = await getAccessToken(refresh);
      if (!token) return null;
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, 'Client-Id': config.twitch.clientId },
      });
      if (res.status !== 401) break;
    }
    return res;
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
      const res = await helixGet(url);
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

  /** Credit watch minutes to everyone sitting in live channels' chats (Get Chatters). */
  async function pollChatters(): Promise<void> {
    if (!client || !creds) return;
    const minutes = Math.round(WATCH_POLL_MS / 60_000);
    for (const [broadcasterId, channelId] of channelByBroadcaster) {
      if (!client.isSubscribed(broadcasterId)) continue;
      if (deps.overlayCount(channelId) === 0) continue; // count only while live
      let cursor: string | undefined;
      do {
        const url = new URL(CHATTERS_URL);
        url.searchParams.set('broadcaster_id', broadcasterId);
        url.searchParams.set('moderator_id', creds.userId);
        url.searchParams.set('first', '1000');
        if (cursor) url.searchParams.set('after', cursor);
        const res = await helixGet(url);
        if (!res?.ok) {
          deps.log.warn(
            { status: res?.status, broadcasterId },
            'twitch-chat: chatters fetch failed — reconnect the bot if it predates the moderator:read:chatters scope',
          );
          break;
        }
        const body = (await res.json()) as {
          data?: { user_id: string; user_login: string; user_name: string }[];
          pagination?: { cursor?: string };
        };
        for (const c of body.data ?? []) {
          if (c.user_id === broadcasterId) continue; // own presence is not watch time
          bumpWatch(channelId, c.user_id, c.user_login, c.user_name, minutes);
        }
        cursor = body.pagination?.cursor;
      } while (cursor);
    }
  }

  async function reconcile(): Promise<void> {
    if (!client) return;
    const moderated = await fetchModeratedBroadcasterIds();
    if (!moderated) return; // transient failure — keep the current subscription set
    // Owner's twitch identity may be native OR linked to a Google account.
    const rows = await db
      .select({
        id: channels.id,
        broadcasterId: linkedIdentities.providerId,
        chatEnabled: channels.chatOverlayEnabled,
      })
      .from(channels)
      .innerJoin(
        linkedIdentities,
        and(
          eq(linkedIdentities.userId, channels.ownerUserId),
          eq(linkedIdentities.provider, 'twitch'),
        ),
      )
      .all();
    const modded = rows.filter((r) => moderated.has(r.broadcasterId));
    channelByBroadcaster = new Map(modded.map((r) => [r.broadcasterId, r.id]));
    chatEnabledChannels = new Set(modded.filter((r) => r.chatEnabled).map((r) => r.id));
    client.setBroadcasters(new Set(channelByBroadcaster.keys()));
    await loadExclusions();
  }

  function shutdownClient(): void {
    client?.stop();
    client = null;
    if (reconcileTimer) clearInterval(reconcileTimer);
    if (statsFlushTimer) clearInterval(statsFlushTimer);
    if (watchPollTimer) clearInterval(watchPollTimer);
    reconcileTimer = null;
    statsFlushTimer = null;
    watchPollTimer = null;
    // Don't lose buffered counters on shutdown/restart.
    void flushActivity(deps.log);
  }

  async function boot(): Promise<void> {
    if (!config.twitch.clientId) return;
    creds = await loadBotCredentials();
    if (!creds) return; // module stays dormant
    client = new EventSubClient({
      botUserId: creds.userId,
      getAccessToken,
      onChatMessage,
      onChatDelete: (bid, messageId) =>
        forwardToOverlay(bid, (chId) => deps.io.to(roomOf(chId)).emit('chat:delete', messageId)),
      onChatClearUser: (bid, userId) =>
        forwardToOverlay(bid, (chId) => deps.io.to(roomOf(chId)).emit('chat:clearUser', userId)),
      onChatClear: (bid) =>
        forwardToOverlay(bid, (chId) => deps.io.to(roomOf(chId)).emit('chat:clear')),
      log: deps.log,
    });
    client.start();
    await reconcile();
    reconcileTimer = setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
    statsFlushTimer = setInterval(() => void flushActivity(deps.log), STATS_FLUSH_MS);
    watchPollTimer = setInterval(
      () => pollChatters().catch((err) => deps.log.warn({ err }, 'twitch-chat: chatters poll failed')),
      WATCH_POLL_MS,
    );
    deps.log.info({ bot: creds.login }, 'twitch-chat: module started');
  }

  void loadExclusions().catch(() => {});
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
    reloadExclusions() {
      void loadExclusions().catch((err) =>
        deps.log.warn({ err }, 'twitch-chat: exclusions reload failed'),
      );
    },
    stop: shutdownClient,
  };
}
