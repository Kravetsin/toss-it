import { and, eq, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import {
  DUST_POINTS,
  LEVEL_POINTS,
  xpToLevel,
  type BotLocale,
  type ChatFragment,
  type EquippedCosmetics,
  type LiveViewer,
} from '@tmw/shared';
import { db } from '../../db/index';
import {
  channelActivity,
  channels,
  excludeSelfSends,
  leaderboardExclusions,
  linkedIdentities,
  submissions,
  users,
} from '../../db/schema';
import { config } from '../../config';
import { roomOf, type QueueState, type RealtimeServer } from '../../playback';
import { EventSubClient } from './eventsub';
import { createBadgeResolver, roleFromBadges, type EventBadge } from './badges';
import { awardDust } from './accrual';
import { runCommand, toChatText } from './commands/index';
import { getRewardById } from '../channel-points/store';
import { bumpMessage, bumpWatch, flushActivity } from './stats';
import { loadBotCredentials, refreshBotCredentials, type BotCredentials } from './token';

const RECONCILE_INTERVAL_MS = 5 * 60_000;
const STATS_FLUSH_MS = 30_000;
const LEVEL_TTL_MS = 60_000;
/** Watch-time granularity: +1 min per poll. Twitch's chatters list lags a couple of
 *  minutes on join/leave, so this only blurs session edges, not the middle. */
const WATCH_POLL_MS = 60_000;
const MODERATED_CHANNELS_URL = 'https://api.twitch.tv/helix/moderation/channels';
const CHAT_MESSAGES_URL = 'https://api.twitch.tv/helix/chat/messages';
const CHATTERS_URL = 'https://api.twitch.tv/helix/chat/chatters';
const COSMETICS_TTL_MS = 60_000;

export interface TwitchChatDeps {
  /** Live signal: the streamer's OBS overlay is connected (platform-agnostic). */
  overlayCount(channelId: string): number;
  /** A submission's spot in the play order, for the !queue command (in-memory, not in SQL). */
  queueState(channelId: string, submissionId: string): QueueState | null;
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
  /** Latest "who's in chat now" snapshot for a live channel (Twitch), or null if unknown. */
  liveViewers(channelId: string): { viewers: LiveViewer[]; at: number } | null;
  /** Admin edited the leaderboard exclusions — refresh the collection guard now. */
  reloadExclusions(): void;
  /** A streamer changed chat settings — pick them up now instead of at the next reconcile. */
  settingsChanged(): void;
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
  /** Channel ids whose streamer opted the bot into writing answers back to Twitch chat. */
  let botReplyChannels = new Set<string>();
  /** Per-channel bot answer language. Refreshed on reconcile; missing = the column default. */
  let botLocales = new Map<string, BotLocale>();
  /** twitch id -> Tossit cosmetics, short-lived cache (chat volume; avoid a DB read per msg). */
  const cosmeticsCache = new Map<
    string,
    { cosmetics: EquippedCosmetics | null; isFounder: boolean; at: number }
  >();
  /** `${channelId} ${twitchId}` -> per-channel level, short-lived cache (chat volume). */
  const levelCache = new Map<string, { level: number; at: number }>();
  /** channel id -> latest Get-Chatters snapshot, for the streamer "who's on stream now" panel. */
  const liveChatters = new Map<string, { viewers: LiveViewer[]; at: number }>();
  // Resolves native platform badges to image URLs (cached catalogs; helixGet is hoisted below).
  const badgeResolver = createBadgeResolver({ helixGet, log: deps.log });

  /**
   * Sender's all-time per-channel level (0–10): chat messages + watch-minutes (from
   * channel_activity, by twitch id — works for unregistered chatters) + 10× aired submissions
   * (played, by linked userId). Cached ~60s to survive chat volume.
   */
  async function lookupLevel(channelId: string, twitchId: string): Promise<number> {
    const key = `${channelId} ${twitchId}`;
    const hit = levelCache.get(key);
    if (hit && Date.now() - hit.at < LEVEL_TTL_MS) return hit.level;
    const act = await db
      .select({
        msg: sql<number>`coalesce(sum(${channelActivity.messages}), 0)`,
        watch: sql<number>`coalesce(sum(${channelActivity.watchMinutes}), 0)`,
      })
      .from(channelActivity)
      .where(
        and(
          eq(channelActivity.channelId, channelId),
          eq(channelActivity.platform, 'twitch'),
          eq(channelActivity.platformUserId, twitchId),
        ),
      )
      .get();
    let xp = (act?.msg ?? 0) + (act?.watch ?? 0);
    const identity = await db
      .select({ userId: linkedIdentities.userId })
      .from(linkedIdentities)
      .where(
        and(eq(linkedIdentities.provider, 'twitch'), eq(linkedIdentities.providerId, twitchId)),
      )
      .get();
    if (identity) {
      const aired = await db
        .select({ n: sql<number>`count(*)` })
        .from(submissions)
        .where(
          and(
            eq(submissions.channelId, channelId),
            eq(submissions.senderUserId, identity.userId),
            eq(submissions.status, 'played'),
            excludeSelfSends,
          ),
        )
        .get();
      xp += (aired?.n ?? 0) * LEVEL_POINTS.airedSend;
    }
    const level = xpToLevel(xp);
    levelCache.set(key, { level, at: Date.now() });
    return level;
  }

  async function loadExclusions(): Promise<void> {
    const rows = await db
      .select({ login: leaderboardExclusions.login })
      .from(leaderboardExclusions)
      .all();
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

  /** Single-flight guard: concurrent 401s must share one refresh, because Twitch
   *  rotates refresh tokens and a second concurrent attempt would consume a dead one. */
  let refreshing: Promise<BotCredentials | null> | null = null;

  async function doRefresh(): Promise<BotCredentials | null> {
    const current = creds;
    if (!current) return null;
    try {
      const next = await refreshBotCredentials(current);
      if (next) {
        creds = next;
        return next;
      }
    } catch (err) {
      deps.log.warn({ err }, 'twitch-chat: token refresh failed, will retry');
      return current; // transient (network/5xx) — keep the old token, retry later
    }
    // Definitive rejection. The in-memory refresh token may be a stale pre-rotation
    // copy while the DB holds the good one — try that before declaring the bot dead.
    const fromDb = await loadBotCredentials().catch(() => null);
    if (fromDb && fromDb.refreshToken !== current.refreshToken) {
      try {
        const next = await refreshBotCredentials(fromDb);
        if (next) {
          creds = next;
          return next;
        }
      } catch {
        creds = fromDb;
        return fromDb;
      }
    }
    deps.log.error('twitch-chat: bot refresh token invalid — reconnect the bot via admin');
    shutdownClient();
    creds = null;
    return null;
  }

  async function getAccessToken(refresh = false): Promise<string | null> {
    if (!creds) return null;
    if (refresh) {
      refreshing ??= doRefresh().finally(() => {
        refreshing = null;
      });
      const next = await refreshing;
      return next?.accessToken ?? null;
    }
    return creds.accessToken;
  }

  interface ChatMsg {
    broadcasterId: string;
    chatterId: string;
    chatterLogin: string;
    chatterName: string;
    messageId: string;
    color: string | null;
    badges: EventBadge[];
    fragments: ChatFragment[];
    reply?: { name: string };
    /** Set when the message is a channel-points reward's text input. */
    rewardId?: string;
  }

  function onChatMessage(ev: ChatMsg): void {
    const channelId = channelByBroadcaster.get(ev.broadcasterId);
    if (!channelId) return;
    // Our own answers arrive back through EventSub like any other chat message. Unfiltered, the
    // bot would mirror itself into the overlay right next to the card it just emitted, award
    // itself chat dust, and climb the channel leaderboard. Only reachable since it started
    // writing, and not covered by excludedLogins — that list is the admin's, filled by hand.
    if (creds && ev.chatterId === creds.userId) return;
    // A message carrying one of OUR reward ids is that reward's input (e.g. the YouTube link). We
    // already render our own redemption line, so don't mirror it as chat spam or credit chat dust
    // for it. Messages from other rewards (Twitch highlight, etc.) are genuine chat — keep them.
    if (ev.rewardId) {
      void getRewardById(ev.rewardId)
        .then((r) => {
          if (r?.channelId !== channelId) handleChatMessage(channelId, ev);
        })
        .catch(() => handleChatMessage(channelId, ev));
      return;
    }
    handleChatMessage(channelId, ev);
  }

  function handleChatMessage(channelId: string, ev: ChatMsg): void {
    const excluded = excludedLogins.has(ev.chatterLogin);
    const live = deps.overlayCount(channelId) > 0;

    // Accrual: not the broadcaster's own chat, not an excluded bot, only while live.
    if (!excluded && ev.chatterId !== ev.broadcasterId && live) {
      bumpMessage(channelId, ev.chatterId, ev.chatterLogin, ev.chatterName);
      awardDust(ev.chatterId, DUST_POINTS.message).catch((err) =>
        deps.log.warn({ err }, 'twitch-chat: accrual failed'),
      );
    }

    if (excluded) return;

    // Where an answer can land. These are independent: a streamer may run the media overlay with
    // no chat overlay at all, and for them Twitch chat is the only surface a command has. Both
    // still require `live` — the bot serves the stream, and staying quiet off-stream keeps one
    // shared bot account off Twitch's platform-wide spam radar.
    const toOverlay = chatEnabledChannels.has(channelId) && live;
    const toChat = botReplyChannels.has(channelId) && live;
    if (toOverlay || toChat) {
      void runCommand(
        ev.fragments,
        {
          channelId,
          twitchId: ev.chatterId,
          login: ev.chatterLogin,
          name: ev.chatterName,
          locale: botLocales.get(channelId) ?? 'ru',
        },
        { queueState: deps.queueState },
      )
        .then((line) => {
          if (!line) return;
          if (toOverlay) deps.io.to(roomOf(channelId)).emit('chat:system', line);
          if (toChat) void sendChatMessage(ev.broadcasterId, toChatText(line));
        })
        .catch((err) => deps.log.warn({ err }, 'twitch-chat: command failed'));
    }

    // Chat overlay mirror: show everyone INCLUDING the streamer (but not excluded bots),
    // only when the channel enabled it and an overlay is actually listening.
    if (!toOverlay) return;
    void Promise.all([
      lookupCosmetics(ev.chatterId),
      lookupLevel(channelId, ev.chatterId),
      badgeResolver.resolve(ev.broadcasterId, ev.badges),
    ])
      .then(([{ cosmetics, isFounder }, level, badges]) => {
        deps.io.to(roomOf(channelId)).emit('chat:message', {
          id: ev.messageId,
          userId: ev.chatterId,
          name: ev.chatterName,
          twitchColor: ev.color,
          cosmetics,
          isFounder,
          level,
          badges,
          role: roleFromBadges(ev.badges),
          reply: ev.reply,
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

  /**
   * Post a message to a channel's chat as the bot; retries once through a token refresh on 401.
   * Needs the user:write:chat scope — a bot connected before that scope existed will 401 forever
   * here and has to be reconnected from admin.
   */
  async function sendChatMessage(broadcasterId: string, message: string): Promise<void> {
    if (!creds) return;
    for (const refresh of [false, true]) {
      const token = await getAccessToken(refresh);
      if (!token) return;
      const res = await fetch(CHAT_MESSAGES_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Client-Id': config.twitch.clientId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          broadcaster_id: broadcasterId,
          sender_id: creds.userId,
          message,
        }),
      });
      if (res.status === 401 && !refresh) continue;
      if (!res.ok) {
        deps.log.warn(
          { status: res.status, broadcasterId },
          'twitch-chat: send failed — reconnect the bot if it predates the user:write:chat scope',
        );
        return;
      }
      // A refusal is a 200 with is_sent=false (AutoMod, channel restriction, duplicate), not an
      // HTTP error — so it has to be read out of the body or it looks like success.
      const body = (await res.json()) as {
        data?: { is_sent: boolean; drop_reason?: { code: string } }[];
      };
      const sent = body.data?.[0];
      if (sent && !sent.is_sent) {
        deps.log.warn(
          { broadcasterId, reason: sent.drop_reason?.code },
          'twitch-chat: message dropped by Twitch',
        );
      }
      return;
    }
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

  /**
   * Credit watch minutes to everyone sitting in live channels' chats (Get Chatters), and dust for
   * the same time — most viewers have nothing to send, so presence is their only earning path.
   */
  async function pollChatters(): Promise<void> {
    if (!client || !creds) return;
    const minutes = Math.round(WATCH_POLL_MS / 60_000);
    // Dust is per-account and global, while minutes are per-channel: someone sitting in several
    // Tossit chats still only lived one minute, so pay each id once across the whole sweep.
    const watched = new Set<string>();
    for (const [broadcasterId, channelId] of channelByBroadcaster) {
      if (!client.isSubscribed(broadcasterId) || deps.overlayCount(channelId) === 0) {
        liveChatters.delete(channelId); // not live/subscribed — drop the stale snapshot
        continue;
      }
      const viewers: LiveViewer[] = [];
      let ok = true;
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
          ok = false;
          break;
        }
        const body = (await res.json()) as {
          data?: { user_id: string; user_login: string; user_name: string }[];
          pagination?: { cursor?: string };
        };
        for (const c of body.data ?? []) {
          if (c.user_id === broadcasterId) continue; // own presence is not watch time
          if (excludedLogins.has(c.user_login)) continue; // hidden bots (admin exclusions)
          bumpWatch(channelId, c.user_id, c.user_login, c.user_name, minutes);
          watched.add(c.user_id);
          viewers.push({ id: c.user_id, login: c.user_login, name: c.user_name });
        }
        cursor = body.pagination?.cursor;
      } while (cursor);
      // Keep the previous snapshot on a partial/failed fetch rather than showing an empty list.
      if (ok) liveChatters.set(channelId, { viewers, at: Date.now() });
    }
    for (const twitchId of watched) {
      awardDust(twitchId, minutes * DUST_POINTS.watchMinute).catch((err) =>
        deps.log.warn({ err }, 'twitch-chat: watch accrual failed'),
      );
    }
  }

  async function reconcile(): Promise<void> {
    if (!client) return;
    await client.verify(); // heal ghost subscriptions before diffing
    const moderated = await fetchModeratedBroadcasterIds();
    if (!moderated) return; // transient failure — keep the current subscription set
    // Owner's twitch identity may be native OR linked to a Google account.
    const rows = await db
      .select({
        id: channels.id,
        broadcasterId: linkedIdentities.providerId,
        chatEnabled: channels.chatOverlayEnabled,
        botReplies: channels.chatBotReplies,
        botLocale: channels.botLocale,
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
    botReplyChannels = new Set(modded.filter((r) => r.botReplies).map((r) => r.id));
    botLocales = new Map(modded.map((r) => [r.id, r.botLocale]));
    client.setBroadcasters(new Set(channelByBroadcaster.keys()));
    await loadExclusions();
  }

  function readsChannel(channelId: string): boolean {
    if (!client) return false;
    for (const [broadcasterId, chId] of channelByBroadcaster) {
      if (chId === channelId) return client.isSubscribed(broadcasterId);
    }
    return false;
  }

  let quickReconcileTimer: NodeJS.Timeout | null = null;
  /** Debounced out-of-schedule reconcile, for "overlay is up but bot is not reading" and for
   *  settings the streamer just flipped in the dashboard. */
  function scheduleQuickReconcile(): void {
    if (!client || quickReconcileTimer) return;
    quickReconcileTimer = setTimeout(() => {
      quickReconcileTimer = null;
      reconcile().catch((err) => deps.log.warn({ err }, 'twitch-chat: quick reconcile failed'));
    }, 2_000);
  }

  function shutdownClient(): void {
    client?.stop();
    client = null;
    if (reconcileTimer) clearInterval(reconcileTimer);
    if (statsFlushTimer) clearInterval(statsFlushTimer);
    if (watchPollTimer) clearInterval(watchPollTimer);
    if (quickReconcileTimer) clearTimeout(quickReconcileTimer);
    reconcileTimer = null;
    statsFlushTimer = null;
    watchPollTimer = null;
    quickReconcileTimer = null;
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
    // An uncaught rejection here would crash the whole server (unhandledRejection).
    reconcileTimer = setInterval(
      () => reconcile().catch((err) => deps.log.warn({ err }, 'twitch-chat: reconcile failed')),
      RECONCILE_INTERVAL_MS,
    );
    statsFlushTimer = setInterval(() => void flushActivity(deps.log), STATS_FLUSH_MS);
    watchPollTimer = setInterval(
      () =>
        pollChatters().catch((err) => deps.log.warn({ err }, 'twitch-chat: chatters poll failed')),
      WATCH_POLL_MS,
    );
    deps.log.info({ bot: creds.login }, 'twitch-chat: module started');
  }

  // Self-heal at the moment it matters most: an overlay just connected (stream is
  // going live) for a channel the bot is not reading — reconcile now, not in ≤5 min.
  deps.io.of('/').adapter.on('join-room', (room: string) => {
    const prefix = roomOf('');
    if (!client || !room.startsWith(prefix)) return;
    if (!readsChannel(room.slice(prefix.length))) scheduleQuickReconcile();
  });

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
    readsChannel,
    liveViewers(channelId) {
      return liveChatters.get(channelId) ?? null;
    },
    reloadExclusions() {
      void loadExclusions().catch((err) =>
        deps.log.warn({ err }, 'twitch-chat: exclusions reload failed'),
      );
    },
    settingsChanged: scheduleQuickReconcile,
    stop: shutdownClient,
  };
}
