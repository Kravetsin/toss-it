import crypto from 'node:crypto';
import { and, asc, count, desc, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CHANNEL_DESCRIPTION_MAX_LEN,
  CHANNEL_LINKS_MAX,
  CHANNEL_LINK_URL_MAX_LEN,
  musicConfigFrom,
  OVERLAY_POSITIONS,
  SOCIAL_PLATFORMS,
  youtubePlaylistId,
  type AccessibleChannel,
  type ChannelLink,
  type ChannelSettings,
  type HistoryEntry,
  type IntegrationStatus,
  type ListedUser,
  type ModInviteInfo,
  type MusicCommand,
  type MusicTrack,
  type OnboardingStatus,
  type ReputationStats,
  type SubmissionSummary,
} from '@tmw/shared';
import { db } from '../db/index';
import {
  bans,
  channelIntegrations,
  channelModerators,
  channels,
  linkedIdentities,
  modInvites,
  submissions,
  users,
  whitelist,
  type ChannelRow,
} from '../db/schema';
import { config } from '../config';
import { requireUser } from '../auth';
import { fetchPlaylistTracks, parseYoutube, validateYoutube } from '../media/youtube';
import type { TwitchChatModule } from '../modules/twitch-chat/index';
import { decryptSecret, encryptSecret } from '../crypto';
import { levelForSender, levelsForSenders } from '../level';
import {
  dashboardRoomOf,
  emitSubmissionStatus,
  equippedMarksFor,
  equippedMarksOf,
  roomOf,
  toSummary,
  type PlaybackManager,
  type RealtimeServer,
} from '../playback';

export interface DashboardRoutesDeps {
  playback: PlaybackManager;
  io: RealtimeServer;
  twitchChat: TwitchChatModule;
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

function toSettings(
  ch: ChannelRow,
  chatBot: { login: string | null; reading: boolean },
): ChannelSettings {
  return {
    chatBotLogin: chatBot.login,
    chatBotReading: chatBot.reading,
    maxDurationMs: ch.maxDurationMs,
    maxAudioDurationMs: ch.maxAudioDurationMs,
    maxFileSizeBytes: ch.maxFileSizeBytes,
    volume: ch.volume,
    accepting: ch.accepting,
    autoApproveYoutube: ch.autoApproveYoutube,
    autoApproveGifs: ch.autoApproveGifs,
    showSenderName: ch.showSenderName,
    soundAlert: ch.soundAlert,
    ttsName: ch.ttsName,
    ttsMessage: ch.ttsMessage,
    chatOverlayEnabled: ch.chatOverlayEnabled,
    chatFontSize: ch.chatFontSize,
    chatFadeSeconds: ch.chatFadeSeconds,
    overlayPosition: ch.overlayPosition,
    overlaySize: ch.overlaySize,
    overlayMargin: ch.overlayMargin,
    musicSeparate: ch.musicSeparate,
    musicPosition: ch.musicPosition,
    musicSize: ch.musicSize,
    musicMargin: ch.musicMargin,
    bgMusicPlaylist: ch.bgMusicPlaylist,
    bgMusicTracks: ch.bgMusicTracks,
    bgMusicShuffle: ch.bgMusicShuffle,
    bgMusicVolume: ch.bgMusicVolume,
    bgMusicHidden: ch.bgMusicHidden,
    description: ch.description,
    links: ch.links,
  };
}

export function registerDashboardRoutes(app: FastifyInstance, deps: DashboardRoutesDeps): void {
  const { playback, io } = deps;

  /** Chat-dust indicator: /mod state on Twitch is the only source of truth, no toggle. */
  const chatBotInfo = async (
    ch: ChannelRow,
  ): Promise<{ login: string | null; reading: boolean }> => {
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
      login: s.connected && twitchIdentity ? s.login : null,
      reading: deps.twitchChat.readsChannel(ch.id),
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
      const current = playback.getCurrent(channel.id);
      return {
        now: current
          ? toSummary(
              current,
              await equippedMarksOf(current.senderUserId),
              await levelForSender(channel.id, current.senderUserId),
            )
          : null,
      };
    },
  );

  /** Skip current display: instantly clears overlay and advances the queue. */
  app.post<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/skip',
    async (req, reply) => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const skipped = await playback.skip(channel.id);
      return { skipped };
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
      return toSettings(channel, await chatBotInfo(channel));
    },
  );

  // Home-page onboarding checklist: coarse "did this ever happen" signals.
  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/onboarding',
    async (req, reply): Promise<OnboardingStatus | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const played = await db
        .select({ id: submissions.id })
        .from(submissions)
        .where(and(eq(submissions.channelId, channel.id), eq(submissions.status, 'played')))
        .limit(1)
        .get();
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
        autoApproveYoutube:
          typeof b.autoApproveYoutube === 'boolean'
            ? b.autoApproveYoutube
            : channel.autoApproveYoutube,
        autoApproveGifs:
          typeof b.autoApproveGifs === 'boolean' ? b.autoApproveGifs : channel.autoApproveGifs,
        showSenderName:
          typeof b.showSenderName === 'boolean' ? b.showSenderName : channel.showSenderName,
        soundAlert: typeof b.soundAlert === 'boolean' ? b.soundAlert : channel.soundAlert,
        ttsName: typeof b.ttsName === 'boolean' ? b.ttsName : channel.ttsName,
        ttsMessage: typeof b.ttsMessage === 'boolean' ? b.ttsMessage : channel.ttsMessage,
        chatOverlayEnabled:
          typeof b.chatOverlayEnabled === 'boolean'
            ? b.chatOverlayEnabled
            : channel.chatOverlayEnabled,
        chatFontSize:
          typeof b.chatFontSize === 'number'
            ? clamp(Math.round(b.chatFontSize), 12, 40)
            : channel.chatFontSize,
        chatFadeSeconds:
          typeof b.chatFadeSeconds === 'number'
            ? clamp(Math.round(b.chatFadeSeconds), 0, 600)
            : channel.chatFadeSeconds,
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
        bgMusicHidden:
          typeof b.bgMusicHidden === 'boolean' ? b.bgMusicHidden : channel.bgMusicHidden,
        description: 'description' in b ? sanitizeDescription(b.description) : channel.description,
        links: 'links' in b ? sanitizeLinks(b.links) : channel.links,
      };
      await db.update(channels).set(patch).where(eq(channels.id, channel.id));
      // Push chat display config live so the OBS chat source updates without a reload.
      io.to(roomOf(channel.id)).emit('chat:config', {
        fontSize: patch.chatFontSize,
        fadeSeconds: patch.chatFadeSeconds,
      });
      // Push background-music config live so the media overlay updates without a reload.
      io.to(roomOf(channel.id)).emit('music:config', musicConfigFrom({ ...channel, ...patch }));
      return toSettings({ ...channel, ...patch }, await chatBotInfo(channel));
    },
  );

  /** The owned, editable background-music track list. */
  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/music/tracks',
    async (req, reply): Promise<{ tracks: MusicTrack[] } | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      return { tracks: channel.bgMusicTracks };
    },
  );

  const MAX_TRACKS = 200;
  /** Persist a new track list, push it live to the overlay, and return it. */
  const saveTracks = async (channelId: string, tracks: MusicTrack[]): Promise<MusicTrack[]> => {
    const capped = tracks.slice(0, MAX_TRACKS);
    await db.update(channels).set({ bgMusicTracks: capped }).where(eq(channels.id, channelId));
    const ch = await db.select().from(channels).where(eq(channels.id, channelId)).get();
    if (ch) io.to(roomOf(channelId)).emit('music:config', musicConfigFrom(ch));
    return capped;
  };

  /** Import a YouTube playlist into the owned list (replaces it). */
  app.post<{ Params: { channelId: string }; Body: { url?: unknown } | null }>(
    '/api/dashboard/:channelId/music/import',
    async (req, reply): Promise<{ tracks: MusicTrack[] } | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const playlistId = typeof req.body?.url === 'string' ? youtubePlaylistId(req.body.url) : null;
      if (!playlistId) return reply.code(400).send({ error: 'Некорректная ссылка на плейлист' });
      const tracks = await fetchPlaylistTracks(playlistId);
      if (tracks.length === 0) {
        return reply.code(422).send({ error: 'Плейлист пуст или нет ключа YouTube API' });
      }
      await db
        .update(channels)
        .set({ bgMusicPlaylist: playlistId })
        .where(eq(channels.id, channel.id));
      return { tracks: await saveTracks(channel.id, tracks) };
    },
  );

  /** Append a single track by video URL/id. */
  app.post<{ Params: { channelId: string }; Body: { url?: unknown } | null }>(
    '/api/dashboard/:channelId/music/track',
    async (req, reply): Promise<{ tracks: MusicTrack[] } | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const parsed = typeof req.body?.url === 'string' ? parseYoutube(req.body.url) : null;
      const videoId = parsed?.videoId ?? null;
      if (!videoId) return reply.code(400).send({ error: 'Некорректная ссылка на видео' });
      if (channel.bgMusicTracks.some((tr) => tr.videoId === videoId)) {
        return reply.code(409).send({ error: 'Трек уже в списке' });
      }
      const meta = await validateYoutube(videoId);
      if (!meta)
        return reply.code(422).send({ error: 'Видео недоступно или встраивание запрещено' });
      const tracks = [...channel.bgMusicTracks, { videoId, title: meta.title || videoId }];
      return { tracks: await saveTracks(channel.id, tracks) };
    },
  );

  /** Set the exact ordered list (handles reorder + delete; client sends final order). */
  app.put<{ Params: { channelId: string }; Body: { videoIds?: unknown } | null }>(
    '/api/dashboard/:channelId/music/tracks',
    async (req, reply): Promise<{ tracks: MusicTrack[] } | undefined> => {
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
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
      const channel = await requireOwnerOf(req, reply, req.params.channelId);
      if (!channel) return;
      const action = req.body?.action;
      if (!action || !['play', 'pause', 'next', 'prev', 'playAt'].includes(action)) {
        return reply.code(400).send({ error: 'Неизвестная команда' });
      }
      const videoId =
        action === 'playAt' && typeof req.body?.videoId === 'string' ? req.body.videoId : undefined;
      io.to(roomOf(channel.id)).emit('music:command', { action, videoId });
      return { ok: true };
    },
  );

  /** History: everything that left pending (metadata only; files are ephemeral, already deleted). */
  app.get<{ Params: { channelId: string } }>(
    '/api/dashboard/:channelId/history',
    async (req, reply): Promise<HistoryEntry[] | undefined> => {
      const channel = await requireChannelAccess(req, reply, req.params.channelId);
      if (!channel) return;
      const rows = await db
        .select({ sub: submissions, founderSince: users.founderSince, equipped: users.equipped })
        .from(submissions)
        .leftJoin(users, eq(users.id, submissions.senderUserId))
        .where(
          and(
            eq(submissions.channelId, channel.id),
            inArray(submissions.status, ['played', 'rejected', 'expired']),
          ),
        )
        .orderBy(desc(submissions.updatedAt))
        .limit(50)
        .all();
      const levels = await levelsForSenders(
        channel.id,
        rows.map((r) => r.sub.senderUserId),
      );
      return rows.map((r) => ({
        ...toSummary(
          r.sub,
          {
            color: r.equipped?.nickColor ?? null,
            nickEffect: r.equipped?.nickEffect ?? null,
            cardEffect: r.equipped?.cardEffect ?? null,
          },
          levels.get(r.sub.senderUserId ?? '') ?? 0,
        ),
        status: r.sub.status,
        isFounder: r.founderSince != null,
      }));
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
