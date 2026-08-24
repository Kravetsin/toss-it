import crypto from 'node:crypto';
import { and, asc, count, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  BOT_LOCALES,
  CHANNEL_DESCRIPTION_MAX_LEN,
  CHANNEL_LINKS_MAX,
  CHANNEL_LINK_URL_MAX_LEN,
  clampSkipVotes,
  earnedBackgroundIds,
  musicConfigFrom,
  MUSIC_DISPLAYS,
  OVERLAY_POSITIONS,
  PAGE_BACKGROUNDS,
  SOCIAL_PLATFORMS,
  youtubePlaylistId,
  type AccessibleChannel,
  type BotLocale,
  type ChannelLink,
  type ChannelSettings,
  type DailyStat,
  type IntegrationStatus,
  type KindStat,
  type ListedUser,
  type LivePresence,
  type ModInviteInfo,
  type MusicCommand,
  type MusicDashboard,
  type MusicDisplay,
  type MusicTrack,
  type OnboardingStatus,
  type ReputationStats,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type StatsPeriod,
  type StatsSummary,
  type PlaybackSlot,
  type SubmissionSummary,
} from '@tmw/shared';
import { chatBoard, excludedLogins, sendsBoard } from './channels';
import { db } from '../db/index';
import { TEST_CHAT_MESSAGES } from '../testChat';
import {
  bans,
  channelDaily,
  channelIntegrations,
  channelModerators,
  channels,
  excludeSelfSends,
  linkedIdentities,
  modInvites,
  submissions,
  users,
  whitelist,
  type ChannelRow,
  type SubmissionRow,
} from '../db/schema';
import { config } from '../config';
import { isAdmin, requireUser } from '../auth';
import {
  fetchPlaylistTracks,
  fetchVideoDurations,
  parseYoutube,
  validateYoutube,
} from '../media/youtube';
import type { TwitchChatModule } from '../modules/twitch-chat/index';
import { commandCatalog } from '../modules/twitch-chat/commands/index';
import type { Payouts } from '../media/payout';
import { decryptSecret, encryptSecret } from '../crypto';
import { levelForSender, levelsForSenders } from '../level';
import {
  dashboardRoomOf,
  emitSubmissionStatus,
  equippedMarksFor,
  equippedMarksOf,
  overlayLayoutsOf,
  roomOf,
  toSummary,
  type PlaybackManager,
  type RealtimeServer,
} from '../playback';

export interface DashboardRoutesDeps {
  playback: PlaybackManager;
  io: RealtimeServer;
  twitchChat: TwitchChatModule;
  payouts: Payouts;
}

/** Public Donatello callback URL for a channel (where the provider POSTs donations). */
function donatelloCallbackUrl(channelId: string): string {
  return `${config.webUrl}/api/donations/donatello/${channelId}`;
}

/** Channel moderation access: owner OR moderator. */
async function requireChannelAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  channelId: string,
): Promise<ChannelRow | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  const channel = await db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) {
    void reply.code(404).send({ error: 'Канал не найден' });
    return null;
  }
  if (channel.ownerUserId === user.id) return channel;
  const mod = await db
    .select({ userId: channelModerators.userId })
    .from(channelModerators)
    .where(and(eq(channelModerators.channelId, channelId), eq(channelModerators.userId, user.id)))
    .get();
  if (!mod) {
    void reply.code(403).send({ error: 'Нет доступа к каналу' });
    return null;
  }
  return channel;
}

/** Channel owner only (settings, token, moderator management). */
async function requireOwnerOf(
  req: FastifyRequest,
  reply: FastifyReply,
  channelId: string,
): Promise<ChannelRow | null> {
  const user = await requireUser(req, reply);
  if (!user) return null;
  const channel = await db.select().from(channels).where(eq(channels.id, channelId)).get();
  if (!channel) {
    void reply.code(404).send({ error: 'Канал не найден' });
    return null;
  }
  if (channel.ownerUserId !== user.id) {
    void reply.code(403).send({ error: 'Только владелец канала' });
    return null;
  }
  return channel;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Which stage a playback control targets; anything unrecognised means the media one, as before. */
function slotFrom(body: { slot?: unknown } | null | undefined): PlaybackSlot {
  return body?.slot === 'music' ? 'music' : 'media';
}

/** A theme hue: an integer wrapped into [0,360), or null for an untouched knob. */
const hueOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? ((Math.round(v) % 360) + 360) % 360 : null;

const DAY_MS = 86_400_000;
/** Page size for the owner's own leaderboards, and the most one request may ask for. */
const BOARD_PAGE = 25;
const BOARD_PAGE_MAX = 100;
const LB_METRICS: readonly string[] = ['sends', 'messages', 'watch', 'level'];
/** UTC 'YYYY-MM-DD' for an epoch-ms instant. */
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Normalize description: trim + cap to limit; empty becomes null. */
function sanitizeDescription(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().slice(0, CHANNEL_DESCRIPTION_MAX_LEN);
  return trimmed.length > 0 ? trimmed : null;
}

/** Drop junk: platform must be whitelisted, URL absolute http(s); cap count. */
function sanitizeLinks(input: unknown): ChannelLink[] {
  if (!Array.isArray(input)) return [];
  const out: ChannelLink[] = [];
  for (const raw of input) {
    if (out.length >= CHANNEL_LINKS_MAX) break;
    if (!raw || typeof raw !== 'object') continue;
    const { platform, url } = raw as { platform?: unknown; url?: unknown };
    if (typeof platform !== 'string' || !SOCIAL_PLATFORMS.includes(platform as never)) continue;
    if (typeof url !== 'string') continue;
    const trimmed = url.trim().slice(0, CHANNEL_LINK_URL_MAX_LEN);
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
    out.push({ platform: platform as ChannelLink['platform'], url: trimmed });
  }
  return out;
}

/**
 * Which page backgrounds the channel has unlocked. Same rule as the public /api/c/:login gate
 * (played, excluding the streamer's own test sends), so settings and the public page agree.
 *
 * An ADMIN-owned channel gets the whole set: same use-only bypass the cosmetics catalogue grants (see
 * `unlocked` in routes/cosmetics), and for the same reason — the thresholds exist to pace viewers,
 * not to stop us from looking at what we shipped. Nothing is granted: the milestone is still unmet,
 * so the moment the owner leaves the admin list the page falls back to what the channel really earned.
 */
async function earnedBackgroundsFor(channelId: string, ownerUserId: string): Promise<string[]> {
  if (isAdmin(ownerUserId)) return PAGE_BACKGROUNDS.map((b) => b.id);
  const row = await db
    .select({ n: count() })
    .from(submissions)
    .where(
      and(eq(submissions.channelId, channelId), eq(submissions.status, 'played'), excludeSelfSends),
    )
    .get();
  return earnedBackgroundIds(row?.n ?? 0);
}

function toSettings(
  ch: ChannelRow,
  chatBot: { login: string | null; reading: boolean },
  earnedBackgrounds: string[],
): ChannelSettings {
  return {
    earnedBackgrounds,
    // Straight from the bot's own registry, so the settings screen lists exactly what answers.
    chatCommands: commandCatalog({
      playEnabled: ch.chatPlayCommand,
      ttsEnabled: ch.chatTtsCommand,
      skipEnabled: ch.chatSkipCommand,
    }),
    chatBotLogin: chatBot.login,
    chatBotReading: chatBot.reading,
    maxDurationMs: ch.maxDurationMs,
    imageDurationMs: ch.imageDurationMs,
    maxAudioDurationMs: ch.maxAudioDurationMs,
    maxFileSizeBytes: ch.maxFileSizeBytes,
    volume: ch.volume,
    accepting: ch.accepting,
    autoApproveYoutubeMusic: ch.autoApproveYoutubeMusic,
    autoApproveYoutubeVideo: ch.autoApproveYoutubeVideo,
    youtubeAutoMaxMinutes: ch.youtubeAutoMaxMinutes,
    autoApproveGifs: ch.autoApproveGifs,
    autoApproveText: ch.autoApproveText,
    showSenderName: ch.showSenderName,
    soundAlert: ch.soundAlert,
    ttsName: ch.ttsName,
    ttsMessage: ch.ttsMessage,
    chatOverlayEnabled: ch.chatOverlayEnabled,
    chatBotReplies: ch.chatBotReplies,
    chatPlayCommand: ch.chatPlayCommand,
    chatTtsCommand: ch.chatTtsCommand,
    chatSkipCommand: ch.chatSkipCommand,
    skipVotesNeeded: ch.skipVotesNeeded,
    botLocale: ch.botLocale,
    chatFontSize: ch.chatFontSize,
    chatFadeSeconds: ch.chatFadeSeconds,
    chatBgOpacity: ch.chatBgOpacity,
    chatCompact: ch.chatCompact,
    chatShowBadges: ch.chatShowBadges,
    chatShowLevel: ch.chatShowLevel,
    chatRoleBorders: ch.chatRoleBorders,
    overlayPosition: ch.overlayPosition,
    overlaySize: ch.overlaySize,
    overlayMargin: ch.overlayMargin,
    allowViewerPosition: ch.allowViewerPosition,
    youtubeAsMusic: ch.youtubeAsMusic,
    parallelSlots: ch.parallelSlots,
    musicSeparate: ch.musicSeparate,
    musicPosition: ch.musicPosition,
    musicSize: ch.musicSize,
    musicMargin: ch.musicMargin,
    bgMusicPlaylist: ch.bgMusicPlaylist,
    bgMusicTracks: ch.bgMusicTracks,
    bgMusicShuffle: ch.bgMusicShuffle,
    bgMusicVolume: ch.bgMusicVolume,
    bgMusicDisplay: ch.bgMusicDisplay,
    pageBackground: ch.pageBackground,
    description: ch.description,
    links: ch.links,
    theme: { accentHue: ch.accentHue, bgHue: ch.bgHue, bgTint: ch.bgTint },
  };
}

export function registerDashboardRoutes(app: FastifyInstance, deps: DashboardRoutesDeps): void {
  const { playback, io, payouts } = deps;

  /** Chat-dust indicator: /mod state on Twitch is the only source of truth, no toggle. */
  const chatBotInfo = async (
    ch: ChannelRow,
  ): Promise<{ login: string | null; reading: boolean; serviceLogin: string | null }> => {
    const s = deps.twitchChat.status();
    // Owner's twitch identity may be native or linked to a Google account.
    const twitchIdentity = s.connected
      ? await db
          .select({ providerId: linkedIdentities.providerId })
          .from(linkedIdentities)
          .where(
            and(
              eq(linkedIdentities.userId, ch.ownerUserId),
              eq(linkedIdentities.provider, 'twitch'),
            ),
          )
          .get()
      : undefined;
    return {
      // `login` gates the bot as usable HERE (owner linked); `serviceLogin` is just the bot's public
      // name whenever the service runs — shown so a not-yet-linked owner can pre-mod the bot.
      login: s.connected && twitchIdentity ? s.login : null,
      // Modded, not subscribed-right-now: the bot only holds subscriptions while an overlay is
      // connected, and a streamer setting things up with OBS closed must not see "not reading".
      reading: deps.twitchChat.moderatesChannel(ch.id),
      serviceLogin: s.connected ? s.login : null,
    };
  };

  /** Channels the user can access (owned + where they moderate). */
  app.get('/api/me/channels', async (req, reply): Promise<AccessibleChannel[] | undefined> => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const result: AccessibleChannel[] = [];
    const own = await db
      .select({ id: channels.id, login: users.login, displayName: users.displayName })
      .from(channels)
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      .where(eq(channels.ownerUserId, user.id))
      .get();
    if (own) {
      result.push({
        channelId: own.id,
        login: own.login,
        displayName: own.displayName,
        role: 'owner',
      });
    }
    const mod = await db
      .select({ id: channels.id, login: users.login, displayName: users.displayName })
      .from(channelModerators)
      .innerJoin(channels, eq(channels.id, channelModerators.channelId))
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      .where(eq(channelModerators.userId, user.id))
      .all();
    for (const r of mod) {
      result.push({
        channelId: r.id,
        login: r.login,
        displayName: r.displayName,
        role: 'moderator',
      });
    }
    return result;
  });

  /** What is on screen now (for the "now playing" panel on dashboard load). */
  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/now',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      // Both slots: `now` keeps its old meaning (the media stage) so existing clients are unaffected,
      // and `nowMusic` carries the compact player's show for the second panel.
      const summaryOf = async (sub: SubmissionRow) =>
        toSummary(
          sub,
          await equippedMarksOf(sub.senderUserId),
          await levelForSender(channel.id, sub.senderUserId),
        );
      const media = playback.getCurrent(channel.id, 'media');
      const music = playback.getCurrent(channel.id, 'music');
      return {
        now: media ? await summaryOf(media) : null,
        nowMusic: music ? await summaryOf(music) : null,
        queue: await playback.queueSummaries(channel.id),
        // The now-playing slider is mod-accessible (like pause/skip/seek), but settings are not —
        // so the current volume rides along here instead of coming from the owner-only settings.
        volume: channel.volume,
      };
    },
  );

  /** Reorder the waiting queue (next-first order of submission ids). */
  app.post<{ Params: { channelId: string }; Body: { ids?: unknown } | null }>(
    '/api/dashboard/:channelId/queue/reorder',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const ids = Array.isArray(req.body?.ids)
        ? req.body.ids.filter((x): x is string => typeof x === 'string')
        : [];
      const ok = playback.reorderQueue(channel.id, ids);
      return { ok };
    },
  );

  /** Drop a single waiting item from the queue (marks it rejected). */
  app.delete<{ Params: { channelId: string; id: string } }>(
    '/api/dashboard/:channelId/queue/:id',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const ok = await playback.removeFromQueue(channel.id, req.params.id);
      return { ok };
    },
  );

  /** Clear the whole waiting queue (the current show keeps playing). */
  app.delete<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/queue',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const removed = await playback.clearQueue(channel.id);
      return { removed };
    },
  );

  /** Skip current display: instantly clears overlay and advances the queue. */
  app.post<{ Params: { channelId: string }; Body: { slot?: unknown } | null }>(
    '/api/dashboard/:channelId/skip',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const skipped = await playback.skip(channel.id, slotFrom(req.body));
      return { skipped };
    },
  );

  /**
   * Reload the channel's overlay sources. For the overlay that is connected but wedged (a stale
   * bundle, a browser source that stopped rendering) — the streamer's alternative is walking over
   * to OBS and refreshing by hand. Returns how many sources were told, so the UI can say nothing
   * happened when none are connected.
   */
  app.post<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/overlay/reload',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const presence = playback.presence(channel.id);
      io.to(roomOf(channel.id)).emit('overlay:reload');
      return { reloaded: presence.media + presence.chat };
    },
  );

  /** Pause / resume the current show (freezes the image timer / pauses the player). */
  app.post<{
    Params: { channelId: string };
    Body: { action?: 'pause' | 'resume'; slot?: unknown } | null;
  }>('/api/dashboard/:channelId/playback', async (req, reply) => {
    const channel = await requireChannelAccess(req, reply, req.params.channelId);
    if (!channel) return;
    const ok =
      req.body?.action === 'resume'
        ? playback.resume(channel.id, slotFrom(req.body))
        : playback.pause(channel.id, slotFrom(req.body));
    return { ok };
  });

  /** Seek the current show to a position (seconds) — video/audio/YouTube only. */
  app.post<{ Params: { channelId: string }; Body: { seconds?: unknown; slot?: unknown } | null }>(
    '/api/dashboard/:channelId/playback/seek',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const seconds = Number(req.body?.seconds);
      if (!Number.isFinite(seconds)) return reply.code(400).send({ error: 'bad_seconds' });
      const ok = playback.seek(channel.id, seconds, slotFrom(req.body));
      return { ok };
    },
  );

  /** Live content volume (0-100): persist as the channel volume and push it to the overlay so the
   *  current show adjusts immediately (the now-playing slider). */
  app.post<{ Params: { channelId: string }; Body: { volume?: unknown } | null }>(
    '/api/dashboard/:channelId/volume',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const raw = Number(req.body?.volume);
      if (!Number.isFinite(raw)) return reply.code(400).send({ error: 'bad_volume' });
      const volume = Math.min(100, Math.max(0, Math.round(raw)));
      await db.update(channels).set({ volume }).where(eq(channels.id, channel.id));
      io.to(roomOf(channel.id)).emit('media:volume', volume);
      return { volume };
    },
  );

  /** Owner sends a test donation: overlay FX preview without a real donation. */
  app.post<{ Params: { channelId: string }; Body: { amount?: unknown } | null }>(
    '/api/dashboard/:channelId/test-donation',
    async (req, reply) => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const raw = req.body?.amount;
      const amount =
        typeof raw === 'number' && Number.isFinite(raw) ? clamp(Math.round(raw), 1, 100_000) : 50;
      io.to(roomOf(channel.id)).emit('donation:fx', {
        provider: 'test',
        donorName: 'Test',
        amount,
        currency: 'UAH',
        message: null,
      });
      return { ok: true };
    },
  );

  /**
   * Owner fires one sample line at their chat overlay. The dashboard drives the cadence (it calls
   * this per line and stops on the second click), so nothing has to be tracked server-side.
   */
  app.post<{ Params: { channelId: string }; Body: { index?: unknown } | null }>(
    '/api/dashboard/:channelId/test-chat',
    async (req, reply) => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      if (playback.overlayCount(channel.id) === 0) {
        return reply
          .code(409)
          .send({ error: 'Оверлей не подключён — добавь Browser Source в OBS и открой его' });
      }
      const raw = req.body?.index;
      const index = typeof raw === 'number' && Number.isFinite(raw) ? Math.abs(Math.trunc(raw)) : 0;
      const sample = TEST_CHAT_MESSAGES[index % TEST_CHAT_MESSAGES.length]!;
      // Fresh id per emit: the same sample can air twice in one run, and the overlay keys
      // messages by id (moderation deletes target it).
      io.to(roomOf(channel.id)).emit('chat:message', { ...sample, id: crypto.randomUUID() });
      return { count: TEST_CHAT_MESSAGES.length };
    },
  );

  // Donation-service integrations (owner-only). Money never flows through us, only events.

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/integrations',
    async (req, reply): Promise<IntegrationStatus[] | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const rows = await db
        .select()
        .from(channelIntegrations)
        .where(eq(channelIntegrations.channelId, channel.id))
        .all();
      return rows.map((r) => {
        let key: string | null = null;
        try {
          key = decryptSecret(r.encToken);
        } catch {
          /* corrupt secret: show as "no key" */
        }
        return {
          provider: r.provider,
          connected: true,
          callbackUrl: donatelloCallbackUrl(channel.id),
          key,
        };
      });
    },
  );

  /**
   * Enable Donatello callback: generate X-Key secret and return it with the URL.
   * Idempotent: repeat calls return the existing key (won't break Donatello setup).
   */
  app.post<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/integrations/donatello',
    async (req, reply): Promise<IntegrationStatus | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;

      const existing = await db
        .select()
        .from(channelIntegrations)
        .where(
          and(
            eq(channelIntegrations.channelId, channel.id),
            eq(channelIntegrations.provider, 'donatello'),
          ),
        )
        .get();

      let key: string | null = null;
      if (existing) {
        try {
          key = decryptSecret(existing.encToken);
        } catch {
          key = null;
        }
      }
      if (!key) {
        key = crypto.randomBytes(24).toString('hex');
        const now = new Date();
        const enc = encryptSecret(key);
        await db
          .insert(channelIntegrations)
          .values({
            channelId: channel.id,
            provider: 'donatello',
            encToken: enc,
            externalName: null,
            lastDonationId: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [channelIntegrations.channelId, channelIntegrations.provider],
            set: { encToken: enc, updatedAt: now },
          });
      }
      return {
        provider: 'donatello',
        connected: true,
        callbackUrl: donatelloCallbackUrl(channel.id),
        key,
      };
    },
  );

  app.delete<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/integrations/donatello',
    async (req, reply) => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      await db
        .delete(channelIntegrations)
        .where(
          and(
            eq(channelIntegrations.channelId, channel.id),
            eq(channelIntegrations.provider, 'donatello'),
          ),
        );
      return { ok: true };
    },
  );

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/settings',
    async (req, reply): Promise<ChannelSettings | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      return toSettings(
        channel,
        await chatBotInfo(channel),
        await earnedBackgroundsFor(channel.id, channel.ownerUserId),
      );
    },
  );

  // Home-page onboarding checklist: coarse "did this ever happen" signals.
  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/onboarding',
    async (req, reply): Promise<OnboardingStatus | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      // Deliberately counts the owner's own sends (no excludeSelfSends): the question here is "did
      // media ever reach an overlay", and a played self-send answers it — otherwise the tick would
      // un-tick itself as soon as OBS closes.
      const played = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(and(eq(submissions.channelId, channel.id), eq(submissions.status, 'played')))
        .limit(1)
        .get();
      // Needs no excludeSelfSends: it already filters the owner out by id.
      const viewerSend = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(
          and(
            eq(submissions.channelId, channel.id),
            ne(submissions.senderUserId, channel.ownerUserId),
          ),
        )
        .limit(1)
        .get();
      const bot = await chatBotInfo(channel);
      return {
        overlayAdded: deps.playback.overlayCount(channel.id) > 0 || !!played,
        hasViewerSend: !!viewerSend,
        botAvailable: bot.login !== null,
        botReading: bot.reading,
        botLogin: bot.serviceLogin,
      };
    },
  );

  app.put<{ Params: { channelId: string }; Body: Partial<ChannelSettings> | null }>(
    '/api/dashboard/:channelId/settings',
    async (req, reply): Promise<ChannelSettings | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const b = req.body ?? {};

      const patch = {
        maxDurationMs:
          typeof b.maxDurationMs === 'number'
            ? clamp(Math.round(b.maxDurationMs), 1_000, 60_000)
            : channel.maxDurationMs,
        imageDurationMs:
          typeof b.imageDurationMs === 'number'
            ? clamp(Math.round(b.imageDurationMs), 1_000, 60_000)
            : channel.imageDurationMs,
        maxAudioDurationMs:
          typeof b.maxAudioDurationMs === 'number'
            ? clamp(Math.round(b.maxAudioDurationMs), 1_000, 600_000)
            : channel.maxAudioDurationMs,
        maxFileSizeBytes:
          typeof b.maxFileSizeBytes === 'number'
            ? clamp(Math.round(b.maxFileSizeBytes), 1024 * 1024, config.maxFileSizeBytes)
            : channel.maxFileSizeBytes,
        volume: typeof b.volume === 'number' ? clamp(Math.round(b.volume), 0, 100) : channel.volume,
        accepting: typeof b.accepting === 'boolean' ? b.accepting : channel.accepting,
        autoApproveYoutubeMusic:
          typeof b.autoApproveYoutubeMusic === 'boolean'
            ? b.autoApproveYoutubeMusic
            : channel.autoApproveYoutubeMusic,
        autoApproveYoutubeVideo:
          typeof b.autoApproveYoutubeVideo === 'boolean'
            ? b.autoApproveYoutubeVideo
            : channel.autoApproveYoutubeVideo,
        youtubeAutoMaxMinutes:
          typeof b.youtubeAutoMaxMinutes === 'number'
            ? clamp(Math.round(b.youtubeAutoMaxMinutes), 1, 10)
            : channel.youtubeAutoMaxMinutes,
        autoApproveGifs:
          typeof b.autoApproveGifs === 'boolean' ? b.autoApproveGifs : channel.autoApproveGifs,
        autoApproveText:
          typeof b.autoApproveText === 'boolean' ? b.autoApproveText : channel.autoApproveText,
        showSenderName:
          typeof b.showSenderName === 'boolean' ? b.showSenderName : channel.showSenderName,
        soundAlert: typeof b.soundAlert === 'boolean' ? b.soundAlert : channel.soundAlert,
        ttsName: typeof b.ttsName === 'boolean' ? b.ttsName : channel.ttsName,
        ttsMessage: typeof b.ttsMessage === 'boolean' ? b.ttsMessage : channel.ttsMessage,
        chatOverlayEnabled:
          typeof b.chatOverlayEnabled === 'boolean'
            ? b.chatOverlayEnabled
            : channel.chatOverlayEnabled,
        chatBotReplies:
          typeof b.chatBotReplies === 'boolean' ? b.chatBotReplies : channel.chatBotReplies,
        chatPlayCommand:
          typeof b.chatPlayCommand === 'boolean' ? b.chatPlayCommand : channel.chatPlayCommand,
        chatTtsCommand:
          typeof b.chatTtsCommand === 'boolean' ? b.chatTtsCommand : channel.chatTtsCommand,
        chatSkipCommand:
          typeof b.chatSkipCommand === 'boolean' ? b.chatSkipCommand : channel.chatSkipCommand,
        skipVotesNeeded:
          typeof b.skipVotesNeeded === 'number'
            ? clampSkipVotes(b.skipVotesNeeded)
            : channel.skipVotesNeeded,
        botLocale: BOT_LOCALES.includes(b.botLocale as BotLocale)
          ? (b.botLocale as BotLocale)
          : channel.botLocale,
        chatFontSize:
          typeof b.chatFontSize === 'number'
            ? clamp(Math.round(b.chatFontSize), 12, 40)
            : channel.chatFontSize,
        chatFadeSeconds:
          typeof b.chatFadeSeconds === 'number'
            ? clamp(Math.round(b.chatFadeSeconds), 0, 600)
            : channel.chatFadeSeconds,
        chatBgOpacity:
          typeof b.chatBgOpacity === 'number'
            ? clamp(Math.round(b.chatBgOpacity), 0, 100)
            : channel.chatBgOpacity,
        chatCompact: typeof b.chatCompact === 'boolean' ? b.chatCompact : channel.chatCompact,
        chatShowBadges:
          typeof b.chatShowBadges === 'boolean' ? b.chatShowBadges : channel.chatShowBadges,
        chatShowLevel:
          typeof b.chatShowLevel === 'boolean' ? b.chatShowLevel : channel.chatShowLevel,
        chatRoleBorders:
          typeof b.chatRoleBorders === 'boolean' ? b.chatRoleBorders : channel.chatRoleBorders,
        overlayPosition: OVERLAY_POSITIONS.includes(b.overlayPosition as never)
          ? (b.overlayPosition as (typeof OVERLAY_POSITIONS)[number])
          : channel.overlayPosition,
        overlaySize:
          typeof b.overlaySize === 'number'
            ? clamp(Math.round(b.overlaySize), 10, 100)
            : channel.overlaySize,
        overlayMargin:
          typeof b.overlayMargin === 'number'
            ? clamp(Math.round(b.overlayMargin), 0, 25)
            : channel.overlayMargin,
        allowViewerPosition:
          typeof b.allowViewerPosition === 'boolean'
            ? b.allowViewerPosition
            : channel.allowViewerPosition,
        youtubeAsMusic:
          typeof b.youtubeAsMusic === 'boolean' ? b.youtubeAsMusic : channel.youtubeAsMusic,
        parallelSlots:
          typeof b.parallelSlots === 'boolean' ? b.parallelSlots : channel.parallelSlots,
        musicSeparate:
          typeof b.musicSeparate === 'boolean' ? b.musicSeparate : channel.musicSeparate,
        musicPosition: OVERLAY_POSITIONS.includes(b.musicPosition as never)
          ? (b.musicPosition as (typeof OVERLAY_POSITIONS)[number])
          : channel.musicPosition,
        musicSize:
          typeof b.musicSize === 'number'
            ? clamp(Math.round(b.musicSize), 10, 100)
            : channel.musicSize,
        musicMargin:
          typeof b.musicMargin === 'number'
            ? clamp(Math.round(b.musicMargin), 0, 25)
            : channel.musicMargin,
        // Store only a validated playlist id (parsed from a URL or bare id); '' clears it.
        bgMusicPlaylist:
          'bgMusicPlaylist' in b
            ? typeof b.bgMusicPlaylist === 'string'
              ? youtubePlaylistId(b.bgMusicPlaylist)
              : null
            : channel.bgMusicPlaylist,
        bgMusicShuffle:
          typeof b.bgMusicShuffle === 'boolean' ? b.bgMusicShuffle : channel.bgMusicShuffle,
        bgMusicVolume:
          typeof b.bgMusicVolume === 'number'
            ? clamp(Math.round(b.bgMusicVolume), 0, 100)
            : channel.bgMusicVolume,
        bgMusicDisplay: MUSIC_DISPLAYS.includes(b.bgMusicDisplay as MusicDisplay)
          ? (b.bgMusicDisplay as MusicDisplay)
          : channel.bgMusicDisplay,
        // Store any known background id or '' (none); the render gate still checks it's earned, so an
        // un-earned id here is harmless. Unknown strings fall back to the current value.
        pageBackground:
          typeof b.pageBackground === 'string' &&
          (b.pageBackground === '' || PAGE_BACKGROUNDS.some((x) => x.id === b.pageBackground))
            ? b.pageBackground
            : channel.pageBackground,
        description: 'description' in b ? sanitizeDescription(b.description) : channel.description,
        links: 'links' in b ? sanitizeLinks(b.links) : channel.links,
        // Theme hues: 0-359 or null (untouched knob); tint 0-100. null must survive so a default
        // channel injects nothing (see @tmw/shared resolveTheme).
        accentHue: b.theme ? hueOrNull(b.theme.accentHue) : channel.accentHue,
        bgHue: b.theme ? hueOrNull(b.theme.bgHue) : channel.bgHue,
        bgTint: b.theme ? clamp(Math.round(Number(b.theme.bgTint) || 0), 0, 100) : channel.bgTint,
      };
      await db.update(channels).set(patch).where(eq(channels.id, channel.id));
      // The bot caches per-channel chat flags between reconciles; a toggle the streamer just
      // flipped should take effect now, not in up to five minutes.
      deps.twitchChat.settingsChanged();
      // Slot routing is cached in the playback manager — the next post must follow the new rules.
      playback.invalidateRouting(channel.id);
      // Push chat display config live so the OBS chat source updates without a reload.
      io.to(roomOf(channel.id)).emit('chat:config', {
        fontSize: patch.chatFontSize,
        fadeSeconds: patch.chatFadeSeconds,
        bgOpacity: patch.chatBgOpacity,
        compact: patch.chatCompact,
        showBadges: patch.chatShowBadges,
        showLevel: patch.chatShowLevel,
        roleBorders: patch.chatRoleBorders,
      });
      // Push background-music config live so the media overlay updates without a reload.
      io.to(roomOf(channel.id)).emit('music:config', musicConfigFrom({ ...channel, ...patch }));
      // Same for the post on screen. Most sends are YouTube and sit there for minutes, so a
      // streamer resizing a video that landed in the wrong player sees it move now, rather than
      // having to send something again to check.
      io.to(roomOf(channel.id)).emit('media:layout', overlayLayoutsOf({ ...channel, ...patch }));
      return toSettings(
        { ...channel, ...patch },
        await chatBotInfo(channel),
        await earnedBackgroundsFor(channel.id, channel.ownerUserId),
      );
    },
  );

  /** Best-effort fill of missing track durations (cosmetic; needs YOUTUBE_API_KEY). */
  const withDurations = async (
    tracks: MusicTrack[],
  ): Promise<{ tracks: MusicTrack[]; changed: boolean }> => {
    const missing = tracks.filter((tr) => tr.durationSec == null).map((tr) => tr.videoId);
    if (missing.length === 0) return { tracks, changed: false };
    const durations = await fetchVideoDurations(missing);
    if (durations.size === 0) return { tracks, changed: false };
    return {
      tracks: tracks.map((tr) =>
        tr.durationSec == null && durations.has(tr.videoId)
          ? { ...tr, durationSec: durations.get(tr.videoId) }
          : tr,
      ),
      changed: true,
    };
  };

  /** The owned, editable background-music track list. */
  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/music/tracks',
    async (req, reply): Promise<MusicDashboard | undefined> => {
      // Owner OR moderator — a mod can DJ the background music.
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      // Lazily backfill durations for lists saved before durations existed.
      const { tracks, changed } = await withDurations(channel.bgMusicTracks);
      if (changed)
        await db.update(channels).set({ bgMusicTracks: tracks }).where(eq(channels.id, channel.id));
      return {
        tracks,
        shuffle: channel.bgMusicShuffle,
        volume: channel.bgMusicVolume,
        display: channel.bgMusicDisplay,
      };
    },
  );

  const MAX_TRACKS = 300;
  /** Persist a new track list, push it live to the overlay, and return it. */
  const saveTracks = async (channelId: string, tracks: MusicTrack[]): Promise<MusicTrack[]> => {
    const capped = tracks.slice(0, MAX_TRACKS);
    await db.update(channels).set({ bgMusicTracks: capped }).where(eq(channels.id, channelId));
    const ch = await db.select().from(channels).where(eq(channels.id, channelId)).get();
    if (ch) io.to(roomOf(channelId)).emit('music:config', musicConfigFrom(ch));
    return capped;
  };

  /** Wipe the whole list — clears the playlist fallback too, so no music resumes in the overlay. */
  app.delete<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/music/tracks',
    async (req, reply): Promise<{ tracks: MusicTrack[] } | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      await db
        .update(channels)
        .set({ bgMusicTracks: [], bgMusicPlaylist: null })
        .where(eq(channels.id, channel.id));
      const ch = await db.select().from(channels).where(eq(channels.id, channel.id)).get();
      if (ch) io.to(roomOf(channel.id)).emit('music:config', musicConfigFrom(ch));
      return { tracks: [] };
    },
  );

  /**
   * Add tracks from one link — a whole playlist (list=…) or a single video. Both APPEND to the
   * owned list, skipping tracks already present, so several playlists can be merged.
   */
  app.post<{ Params: { channelId: string }; Body: { url?: unknown } | null }>(
    '/api/dashboard/:channelId/music/add',
    async (req, reply): Promise<{ tracks: MusicTrack[]; added: number } | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const url = typeof req.body?.url === 'string' ? req.body.url : '';
      const seen = new Set(channel.bgMusicTracks.map((tr) => tr.videoId));

      // A `list=` param (or a bare playlist id) → add the whole playlist; else a single video.
      const playlistId = youtubePlaylistId(url);
      if (playlistId) {
        const fetched = await fetchPlaylistTracks(playlistId);
        if (fetched.length === 0) {
          return reply.code(422).send({ error: 'Плейлист пуст или нет ключа YouTube API' });
        }
        const fresh = (await withDurations(fetched.filter((tr) => !seen.has(tr.videoId)))).tracks;
        await db
          .update(channels)
          .set({ bgMusicPlaylist: playlistId })
          .where(eq(channels.id, channel.id));
        const tracks = await saveTracks(channel.id, [...channel.bgMusicTracks, ...fresh]);
        return { tracks, added: fresh.length };
      }

      const videoId = parseYoutube(url)?.videoId ?? null;
      if (!videoId) return reply.code(400).send({ error: 'Некорректная ссылка' });
      if (seen.has(videoId)) return reply.code(409).send({ error: 'Трек уже в списке' });
      const meta = await validateYoutube(videoId);
      if (!meta)
        return reply.code(422).send({ error: 'Видео недоступно или встраивание запрещено' });
      const tracks = await saveTracks(channel.id, [
        ...channel.bgMusicTracks,
        ...(await withDurations([{ videoId, title: meta.title || videoId }])).tracks,
      ]);
      return { tracks, added: 1 };
    },
  );

  /** Set the exact ordered list (handles reorder + delete; client sends final order). */
  app.put<{ Params: { channelId: string }; Body: { videoIds?: unknown } | null }>(
    '/api/dashboard/:channelId/music/tracks',
    async (req, reply): Promise<{ tracks: MusicTrack[] } | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const ids = Array.isArray(req.body?.videoIds) ? req.body.videoIds : null;
      if (!ids) return reply.code(400).send({ error: 'Некорректный список' });
      // Reorder/drop only within the current list — titles are preserved, no id invented.
      const byId = new Map(channel.bgMusicTracks.map((tr) => [tr.videoId, tr]));
      const seen = new Set<string>();
      const tracks: MusicTrack[] = [];
      for (const id of ids) {
        if (typeof id === 'string' && byId.has(id) && !seen.has(id)) {
          seen.add(id);
          tracks.push(byId.get(id)!);
        }
      }
      return { tracks: await saveTracks(channel.id, tracks) };
    },
  );

  /** Transport command from the dashboard → relayed to the overlay's music player. */
  app.post<{ Params: { channelId: string }; Body: MusicCommand | null }>(
    '/api/dashboard/:channelId/music/command',
    async (req, reply): Promise<{ ok: true } | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const action = req.body?.action;
      if (!action || !['play', 'pause', 'next', 'prev', 'playAt', 'seek'].includes(action)) {
        return reply.code(400).send({ error: 'Неизвестная команда' });
      }
      const videoId =
        action === 'playAt' && typeof req.body?.videoId === 'string' ? req.body.videoId : undefined;
      const seconds =
        action === 'seek' && typeof req.body?.seconds === 'number'
          ? clamp(req.body.seconds, 0, 86_400)
          : undefined;
      io.to(roomOf(channel.id)).emit('music:command', { action, videoId, seconds });
      return { ok: true };
    },
  );

  /** DJ knobs (shuffle / volume / display) — owner OR moderator. Separate from the owner-only settings
   *  PATCH so a mod can run the music without touching the channel's settings or token. */
  app.patch<{
    Params: { channelId: string };
    Body: { shuffle?: unknown; volume?: unknown; display?: unknown } | null;
  }>(
    '/api/dashboard/:channelId/music/config',
    async (req, reply): Promise<MusicDashboard | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const b = req.body ?? {};
      const patch: Partial<typeof channels.$inferInsert> = {};
      if (typeof b.shuffle === 'boolean') patch.bgMusicShuffle = b.shuffle;
      if (typeof b.volume === 'number') patch.bgMusicVolume = clamp(Math.round(b.volume), 0, 100);
      if (MUSIC_DISPLAYS.includes(b.display as MusicDisplay))
        patch.bgMusicDisplay = b.display as MusicDisplay;
      const merged = { ...channel, ...patch };
      if (Object.keys(patch).length > 0) {
        await db.update(channels).set(patch).where(eq(channels.id, channel.id));
        io.to(roomOf(channel.id)).emit('music:config', musicConfigFrom(merged));
      }
      return {
        tracks: merged.bgMusicTracks,
        shuffle: merged.bgMusicShuffle,
        volume: merged.bgMusicVolume,
        display: merged.bgMusicDisplay,
      };
    },
  );

  /**
   * Owner-only stats overview. ONE window governs the whole page (see StatsSummary.period): every
   * total, the series and the kind breakdown are computed for it, because a period switch that moves
   * three charts out of eleven blocks reads as broken — which is how this was reported.
   *
   * 'month' is the current CALENDAR month, matching what the leaderboards below already call a month.
   * The series granularity follows the window: a bar per day for a month, a bar per month for all
   * time. A daily series over a channel's whole history would be hundreds of bars in a 500px card.
   */
  app.get<{ Params: { channelId: string }; Querystring: { period?: string } }>(
    '/api/dashboard/:channelId/stats',
    async (req, reply): Promise<StatsSummary | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const period: StatsPeriod = req.query.period === 'all' ? 'all' : 'month';
      const bucket = period === 'all' ? 'month' : 'day';
      const nowD = new Date();
      const todayStart = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate());
      const monthStart = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), 1);
      // 'all' has no lower bound; every query below simply drops its date filter.
      const sinceMs = period === 'month' ? monthStart : null;
      const inPeriod = sinceMs === null ? [] : [gte(submissions.createdAt, new Date(sinceMs))];

      // Bucket the ms timestamp into a UTC calendar day or month, whichever this window charts.
      // sql.raw for the format: it comes from the ternary above, never from the request, and a bound
      // parameter inside a GROUP BY expression is the kind of thing that works until a driver changes.
      const fmt = sql.raw(bucket === 'month' ? '%Y-%m' : '%Y-%m-%d');
      const dayExpr = sql<string>`strftime('${fmt}', ${submissions.createdAt} / 1000, 'unixepoch')`;
      const subDaily = await db
        .select({
          day: dayExpr,
          submissions: sql<number>`count(*)`,
          aired: sql<number>`sum(case when ${submissions.status} = 'played' then 1 else 0 end)`,
          rejected: sql<number>`sum(case when ${submissions.status} = 'rejected' then 1 else 0 end)`,
        })
        .from(submissions)
        .where(and(eq(submissions.channelId, channel.id), ...inPeriod, excludeSelfSends))
        .groupBy(dayExpr)
        .all();

      // Chat counters are stored per day; the all-time view folds them into months on the way out.
      const chatRows = await db
        .select({
          day: channelDaily.day,
          messages: channelDaily.messages,
          watchMinutes: channelDaily.watchMinutes,
        })
        .from(channelDaily)
        .where(
          and(
            eq(channelDaily.channelId, channel.id),
            ...(sinceMs === null ? [] : [gte(channelDaily.day, utcDay(sinceMs))]),
          ),
        )
        .all();

      const subByDay = new Map(subDaily.map((r) => [r.day, r]));
      const chatByDay = new Map<string, { messages: number; watchMinutes: number }>();
      for (const r of chatRows) {
        const key = bucket === 'month' ? r.day.slice(0, 7) : r.day;
        const acc = chatByDay.get(key) ?? { messages: 0, watchMinutes: 0 };
        acc.messages += r.messages;
        acc.watchMinutes += r.watchMinutes;
        chatByDay.set(key, acc);
      }

      // The axis is built from the calendar, not from the rows: a bucket with no activity has to be
      // an empty bar rather than a gap, or the chart silently compresses quiet stretches away.
      const keys: string[] = [];
      if (bucket === 'day') {
        for (let ms = monthStart; ms <= todayStart; ms += DAY_MS) keys.push(utcDay(ms));
      } else {
        // From the earliest month that has anything at all, up to the current one.
        const earliest = [...subByDay.keys(), ...chatByDay.keys()].sort()[0];
        const nowKey = utcDay(todayStart).slice(0, 7);
        let cur = earliest ?? nowKey;
        while (cur <= nowKey) {
          keys.push(cur);
          const [y, m] = cur.split('-').map(Number) as [number, number];
          cur = utcDay(Date.UTC(y, m, 1)).slice(0, 7); // month index is 0-based, so this is "next"
        }
      }
      const daily: DailyStat[] = keys.map((day) => {
        const sub = subByDay.get(day);
        const chat = chatByDay.get(day);
        return {
          day,
          submissions: sub?.submissions ?? 0,
          aired: sub?.aired ?? 0,
          rejected: sub?.rejected ?? 0,
          messages: chat?.messages ?? 0,
          watchMinutes: chat?.watchMinutes ?? 0,
        };
      });

      const byKindRows = await db
        .select({ kind: submissions.kind, count: sql<number>`count(*)` })
        .from(submissions)
        .where(and(eq(submissions.channelId, channel.id), ...inPeriod, excludeSelfSends))
        .groupBy(submissions.kind)
        .all();
      const byKind: KindStat[] = byKindRows
        .map((r) => ({ kind: r.kind, count: r.count }))
        .sort((a, b) => b.count - a.count);

      const totals = await db
        .select({
          total: sql<number>`count(*)`,
          aired: sql<number>`sum(case when ${submissions.status} = 'played' then 1 else 0 end)`,
          rejected: sql<number>`sum(case when ${submissions.status} = 'rejected' then 1 else 0 end)`,
          today: sql<number>`sum(case when ${submissions.createdAt} >= ${todayStart} then 1 else 0 end)`,
          contributors: sql<number>`count(distinct ${submissions.senderUserId})`,
        })
        .from(submissions)
        .where(and(eq(submissions.channelId, channel.id), ...inPeriod, excludeSelfSends))
        .get();

      return {
        period,
        bucket,
        submissions: totals?.total ?? 0,
        aired: totals?.aired ?? 0,
        rejected: totals?.rejected ?? 0,
        uniqueContributors: totals?.contributors ?? 0,
        messages: daily.reduce((n, d) => n + d.messages, 0),
        watchMinutes: daily.reduce((n, d) => n + d.watchMinutes, 0),
        todaySubmissions: totals?.today ?? 0,
        daily,
        byKind,
      };
    },
  );

  /**
   * Owner-only leaderboards: the same boards the public channel page shows, but PAGED through the
   * whole room rather than capped at the public top ten. This is the streamer looking at their own
   * channel, where "who is in my top 40" is a real question and the viewer page was, until now, the
   * richer view of the two.
   *
   * Paged, not "all rows": a busy channel has thousands of chatters, every row carries the sender's
   * cosmetics and costs a level lookup, and four boards load at once on this page. The client walks
   * it with an offset as the reader scrolls.
   */
  app.get<{
    Params: { channelId: string };
    Querystring: { metric?: string; period?: string; limit?: string; offset?: string };
  }>(
    '/api/dashboard/:channelId/leaderboard',
    async (req, reply): Promise<LeaderboardEntry[] | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const metric = (
        LB_METRICS.includes(req.query.metric ?? '') ? req.query.metric : 'sends'
      ) as LeaderboardMetric;
      const period: LeaderboardPeriod = req.query.period === 'month' ? 'month' : 'all';
      const limit = clamp(parseInt(req.query.limit ?? '', 10) || BOARD_PAGE, 1, BOARD_PAGE_MAX);
      const offset = Math.max(0, parseInt(req.query.offset ?? '', 10) || 0);
      const excluded = await excludedLogins();
      return metric === 'sends'
        ? sendsBoard(channel.id, period, excluded, limit, offset)
        : chatBoard(channel.id, metric, period, excluded, limit, offset);
    },
  );

  /** Owner-only "who's on stream now": OBS-overlay live signal + current chatters (Twitch for now). */
  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/live',
    async (req, reply): Promise<LivePresence | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const snap = deps.twitchChat.liveViewers(channel.id);
      return {
        live: playback.overlayCount(channel.id) > 0,
        provider: snap ? 'twitch' : null,
        viewers: snap?.viewers ?? [],
        updatedAt: snap?.at ?? null,
      };
    },
  );

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/pending',
    async (req, reply): Promise<SubmissionSummary[] | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const rows = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.channelId, channel.id), eq(submissions.status, 'pending')))
        .orderBy(asc(submissions.createdAt))
        .all();
      const ids = rows.map((r) => r.senderUserId);
      const [marks, levels] = await Promise.all([
        equippedMarksFor(ids),
        levelsForSenders(channel.id, ids),
      ]);
      return rows.map((r) =>
        toSummary(r, marks.get(r.senderUserId ?? ''), levels.get(r.senderUserId ?? '') ?? 0),
      );
    },
  );

  /** Cross-channel reputation for a set of users (aggregates across all channels). */
  app.post<{ Params: { channelId: string }; Body: { userIds?: unknown } | null }>(
    '/api/dashboard/:channelId/reputation',
    async (req, reply): Promise<Record<string, ReputationStats> | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const raw = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
      const ids = [
        ...new Set(raw.filter((x): x is string => typeof x === 'string' && x.length > 0)),
      ].slice(0, 200);
      if (ids.length === 0) return {};

      const result: Record<string, ReputationStats> = {};
      for (const id of ids) {
        result[id] = {
          accepted: 0,
          rejected: 0,
          whitelistedChannels: 0,
          bannedChannels: 0,
          isFounder: false,
        };
      }

      const founders = await db
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, ids), isNotNull(users.founderSince)))
        .all();
      for (const f of founders) {
        const rep = result[f.id];
        if (rep) rep.isFounder = true;
      }

      const subs = await db
        .select({ userId: submissions.senderUserId, status: submissions.status, n: count() })
        .from(submissions)
        .where(
          and(
            inArray(submissions.senderUserId, ids),
            inArray(submissions.status, ['played', 'rejected']),
            excludeSelfSends,
          ),
        )
        .groupBy(submissions.senderUserId, submissions.status)
        .all();
      for (const r of subs) {
        const rep = r.userId ? result[r.userId] : undefined;
        if (!rep) continue;
        if (r.status === 'played') rep.accepted = r.n;
        else if (r.status === 'rejected') rep.rejected = r.n;
      }

      const wl = await db
        .select({ userId: whitelist.userId, n: count() })
        .from(whitelist)
        .where(inArray(whitelist.userId, ids))
        .groupBy(whitelist.userId)
        .all();
      for (const r of wl) {
        const rep = result[r.userId];
        if (rep) rep.whitelistedChannels = r.n;
      }

      const bn = await db
        .select({ userId: bans.userId, n: count() })
        .from(bans)
        .where(inArray(bans.userId, ids))
        .groupBy(bans.userId)
        .all();
      for (const r of bn) {
        const rep = result[r.userId];
        if (rep) rep.bannedChannels = r.n;
      }

      return result;
    },
  );

  app.post<{ Params: { channelId: string; id: string }; Body: { whitelist?: boolean } | null }>(
    '/api/dashboard/:channelId/submissions/:id/approve',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;

      const sub = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.id, req.params.id), eq(submissions.channelId, channel.id)))
        .get();
      if (!sub || sub.status !== 'pending') {
        return reply.code(404).send({ error: 'Отправка не найдена или уже обработана' });
      }

      const updated = { ...sub, status: 'approved' as const, updatedAt: new Date() };
      await db
        .update(submissions)
        .set({ status: updated.status, updatedAt: updated.updatedAt })
        .where(eq(submissions.id, sub.id));

      if (req.body?.whitelist && sub.senderUserId) {
        await db
          .insert(whitelist)
          .values({ channelId: channel.id, userId: sub.senderUserId, createdAt: new Date() })
          .onConflictDoNothing();
      }

      const queuePosition = playback.enqueue(updated);
      io.to(dashboardRoomOf(channel.id)).emit('moderation:resolved', sub.id);
      emitSubmissionStatus(io, sub.id, 'approved');
      return { ok: true, queuePosition };
    },
  );

  app.post<{ Params: { channelId: string; id: string }; Body: { ban?: boolean } | null }>(
    '/api/dashboard/:channelId/submissions/:id/reject',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;

      const sub = await db
        .select()
        .from(submissions)
        .where(and(eq(submissions.id, req.params.id), eq(submissions.channelId, channel.id)))
        .get();
      if (!sub || sub.status !== 'pending') {
        return reply.code(404).send({ error: 'Отправка не найдена или уже обработана' });
      }

      await db
        .update(submissions)
        .set({ status: 'rejected', updatedAt: new Date() })
        .where(eq(submissions.id, sub.id));
      // Rejected before it ever aired: no dust for either side, and channel points go back.
      await payouts.settle(sub.id, 'failed');
      io.to(dashboardRoomOf(channel.id)).emit('moderation:resolved', sub.id);
      emitSubmissionStatus(io, sub.id, 'rejected');

      if (req.body?.ban && sub.senderUserId) {
        await banUserInChannel(io, channel.id, sub.senderUserId);
      }

      return { ok: true };
    },
  );

  /** Direct ban by userId (e.g. from history, for whitelisted viewers whose
   *  submissions bypass the moderation queue). */
  app.post<{ Params: { channelId: string; userId: string } }>(
    '/api/dashboard/:channelId/bans/:userId',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      await banUserInChannel(io, channel.id, req.params.userId);
      return { ok: true };
    },
  );

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/whitelist',
    async (req, reply): Promise<ListedUser[] | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      return listUsers(whitelist, channel.id);
    },
  );

  app.delete<{ Params: { channelId: string; userId: string } }>(
    '/api/dashboard/:channelId/whitelist/:userId',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      await db
        .delete(whitelist)
        .where(and(eq(whitelist.channelId, channel.id), eq(whitelist.userId, req.params.userId)));
      return { ok: true };
    },
  );

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/bans',
    async (req, reply): Promise<ListedUser[] | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      return listUsers(bans, channel.id);
    },
  );

  app.delete<{ Params: { channelId: string; userId: string } }>(
    '/api/dashboard/:channelId/bans/:userId',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      await db
        .delete(bans)
        .where(and(eq(bans.channelId, channel.id), eq(bans.userId, req.params.userId)));
      return { ok: true };
    },
  );

  // Moderator team management (owner-only)

  /** Create a one-time invite token (TTL 1h). Streamer sends the link themselves. */
  app.post<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/moderators/invite',
    async (req, reply): Promise<{ token: string } | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const token = crypto.randomBytes(24).toString('hex');
      const now = new Date();
      await db.insert(modInvites).values({
        token,
        channelId: channel.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      });
      return { token };
    },
  );

  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/moderators',
    async (req, reply): Promise<ListedUser[] | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      return listUsers(channelModerators, channel.id);
    },
  );

  app.delete<{ Params: { channelId: string; userId: string } }>(
    '/api/dashboard/:channelId/moderators/:userId',
    async (req, reply) => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      await db
        .delete(channelModerators)
        .where(
          and(
            eq(channelModerators.channelId, channel.id),
            eq(channelModerators.userId, req.params.userId),
          ),
        );
      return { ok: true };
    },
  );

  // Invite acceptance (any logged-in user)

  app.get<{ Params: { token: string } }>(
    '/api/mod-invite/:token',
    async (req, reply): Promise<ModInviteInfo | undefined> => {
      const invite = await db
        .select()
        .from(modInvites)
        .where(eq(modInvites.token, req.params.token))
        .get();
      if (!invite || invite.expiresAt.getTime() < Date.now()) {
        return reply.code(404).send({ error: 'Приглашение недействительно или истекло' });
      }
      const ch = await db
        .select({ login: users.login, displayName: users.displayName })
        .from(channels)
        .innerJoin(users, eq(users.id, channels.ownerUserId))
        .where(eq(channels.id, invite.channelId))
        .get();
      if (!ch) return reply.code(404).send({ error: 'Канал не найден' });
      return { channelLogin: ch.login, channelDisplayName: ch.displayName };
    },
  );

  app.post<{ Params: { token: string } }>(
    '/api/mod-invite/:token/accept',
    async (req, reply): Promise<{ channelId: string } | undefined> => {
      const user = await requireUser(req, reply);
      if (!user) return;
      const invite = await db
        .select()
        .from(modInvites)
        .where(eq(modInvites.token, req.params.token))
        .get();
      if (!invite || invite.expiresAt.getTime() < Date.now()) {
        return reply.code(404).send({ error: 'Приглашение недействительно или истекло' });
      }
      // Atomic claim: whoever deletes the row activates the invite (guards against race/double-click).
      const claim = await db.delete(modInvites).where(eq(modInvites.token, invite.token));
      if (claim.rowsAffected === 0) {
        return reply.code(404).send({ error: 'Приглашение уже использовано' });
      }
      const channel = await db
        .select({ ownerUserId: channels.ownerUserId })
        .from(channels)
        .where(eq(channels.id, invite.channelId))
        .get();
      // Owner moderating their own channel is pointless; token already consumed above.
      if (channel && channel.ownerUserId !== user.id) {
        await db
          .insert(channelModerators)
          .values({ channelId: invite.channelId, userId: user.id, createdAt: new Date() })
          .onConflictDoNothing();
      }
      return { channelId: invite.channelId };
    },
  );
}

/** Ban a viewer in a channel: remove from whitelist and reject their pending submissions. */
async function banUserInChannel(
  io: RealtimeServer,
  channelId: string,
  userId: string,
): Promise<void> {
  await db.insert(bans).values({ channelId, userId, createdAt: new Date() }).onConflictDoNothing();
  // Ban is incompatible with auto-play; remove from whitelist.
  await db
    .delete(whitelist)
    .where(and(eq(whitelist.channelId, channelId), eq(whitelist.userId, userId)));
  // Drop all of this viewer's pending submissions from moderation.
  const pending = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.channelId, channelId),
        eq(submissions.senderUserId, userId),
        eq(submissions.status, 'pending'),
      ),
    )
    .all();
  for (const o of pending) {
    await db
      .update(submissions)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(submissions.id, o.id));
    io.to(dashboardRoomOf(channelId)).emit('moderation:resolved', o.id);
    emitSubmissionStatus(io, o.id, 'rejected');
  }
}

async function listUsers(
  table: typeof whitelist | typeof bans | typeof channelModerators,
  channelId: string,
): Promise<ListedUser[]> {
  const rows = await db
    .select({
      userId: table.userId,
      login: users.login,
      displayName: users.displayName,
      addedAt: table.createdAt,
      founderSince: users.founderSince,
    })
    .from(table)
    .innerJoin(users, eq(users.id, table.userId))
    .where(eq(table.channelId, channelId))
    .all();
  return rows.map(({ founderSince, addedAt, ...r }) => ({
    ...r,
    addedAt: addedAt.getTime(),
    isFounder: founderSince != null,
  }));
}
