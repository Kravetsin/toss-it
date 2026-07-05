import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import type {
  EquippedCosmetics,
  LiveStatus,
  MediaPlayPayload,
  OverlayToServerEvents,
  ServerToDashboardEvents,
  ServerToOverlayEvents,
  ServerToViewerEvents,
  SubmissionSummary,
} from '@tmw/shared';
import { db } from './db/index';
import { channelModerators, channels, submissions, users, type SubmissionRow } from './db/schema';
import { config } from './config';
import { getUserFromCookieHeader } from './auth';

export type RealtimeServer = Server<
  OverlayToServerEvents,
  ServerToOverlayEvents & ServerToDashboardEvents & ServerToViewerEvents
>;

export function roomOf(channelId: string): string {
  return `channel:${channelId}`;
}

/** Streamer dashboard room: live moderation and playback events. */
export function dashboardRoomOf(channelId: string): string {
  return `dashboard:${channelId}`;
}

/** Per-submission room: live status for the viewer page. */
export function submissionRoomOf(submissionId: string): string {
  return `submission:${submissionId}`;
}

export function emitSubmissionStatus(
  io: RealtimeServer,
  submissionId: string,
  status: LiveStatus,
): void {
  io.to(submissionRoomOf(submissionId)).emit('submission:status', { submissionId, status });
}

/** A sender's equipped cosmetics (nick color + nick effect + card effect) for rendering. */
export interface NickMarks {
  color: string | null;
  nickEffect: string | null;
  cardEffect: string | null;
}
const NO_MARKS: NickMarks = { color: null, nickEffect: null, cardEffect: null };

function marksFromEquipped(equipped: EquippedCosmetics | null): NickMarks {
  return {
    color: equipped?.nickColor ?? null,
    nickEffect: equipped?.nickEffect ?? null,
    cardEffect: equipped?.cardEffect ?? null,
  };
}

export function toSummary(sub: SubmissionRow, marks: NickMarks = NO_MARKS): SubmissionSummary {
  return {
    id: sub.id,
    senderUserId: sub.senderUserId,
    senderName: sub.senderName,
    senderColor: marks.color,
    senderEffect: marks.nickEffect,
    senderCardEffect: marks.cardEffect,
    kind: sub.kind,
    mime: sub.mime,
    text: sub.text,
    durationMs: sub.durationMs,
    createdAt: sub.createdAt.getTime(),
    url: `/api/media/${sub.id}`,
    youtubeId: sub.youtubeId,
    giphyId: sub.giphyId,
  };
}

/** Resolve a single sender's equipped marks (empty if anon/none). */
export async function equippedMarksOf(userId: string | null): Promise<NickMarks> {
  if (!userId) return NO_MARKS;
  const row = await db
    .select({ equipped: users.equipped })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return marksFromEquipped(row?.equipped ?? null);
}

/** Batch-resolve equipped marks for a set of users (avoids N+1 in list endpoints). */
export async function equippedMarksFor(
  userIds: (string | null)[],
): Promise<Map<string, NickMarks>> {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  const out = new Map<string, NickMarks>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ id: users.id, equipped: users.equipped })
    .from(users)
    .where(inArray(users.id, ids))
    .all();
  for (const r of rows) {
    const e = r.equipped;
    if (e?.nickColor || e?.nickEffect || e?.cardEffect) out.set(r.id, marksFromEquipped(e));
  }
  return out;
}

/** toSummary with the sender's equipped marks resolved (for live socket emits). */
export async function toLiveSummary(sub: SubmissionRow): Promise<SubmissionSummary> {
  return toSummary(sub, await equippedMarksOf(sub.senderUserId));
}

/** Sender's overlay marks — color + effects + badge ids (founder + future), one query. */
export async function senderMarksOf(
  userId: string | null,
): Promise<NickMarks & { badges: string[] }> {
  if (!userId) return { ...NO_MARKS, badges: [] };
  const row = await db
    .select({ equipped: users.equipped, founderSince: users.founderSince })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  const badges: string[] = [];
  if (row?.founderSince != null) badges.push('founder');
  return { ...marksFromEquipped(row?.equipped ?? null), badges };
}

interface ChannelState {
  queue: SubmissionRow[];
  current: SubmissionRow | null;
  watchdog: NodeJS.Timeout | null;
}

/**
 * Per-channel playback queue, strictly one at a time: next item goes to the
 * overlay only after playback:done (or via watchdog if the overlay died mid-show).
 */
export class PlaybackManager {
  private states = new Map<string, ChannelState>();

  constructor(private io: RealtimeServer) {}

  /** Returns queue position (1 = next). */
  enqueue(sub: SubmissionRow): number {
    const st = this.state(sub.channelId);
    st.queue.push(sub);
    const position = st.queue.length + (st.current ? 1 : 0);
    void this.tryNext(sub.channelId);
    return position;
  }

  /** On server start, requeue everything that never got played. */
  async recoverFromDb(): Promise<void> {
    const rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.status, 'approved'))
      .all();
    for (const row of rows) {
      this.state(row.channelId).queue.push(row);
    }
  }

  getCurrent(channelId: string): SubmissionRow | null {
    return this.state(channelId).current;
  }

  /** Streamer skips the current show. true if something was playing. */
  async skip(channelId: string): Promise<boolean> {
    const current = this.state(channelId).current;
    if (!current) return false;
    // Overlay gets media:skip and clears the screen; onDone advances the queue
    // regardless of whether the overlay is alive.
    this.io.to(roomOf(channelId)).emit('media:skip', current.id);
    await this.onDone(channelId, current.id);
    return true;
  }

  async onOverlayConnected(
    channelId: string,
    replayTo: (payload: MediaPlayPayload) => void,
  ): Promise<void> {
    const st = this.state(channelId);
    if (st.current) {
      // Overlay reconnected mid-show: replay the current item.
      replayTo(await this.buildPayload(st.current));
    } else {
      void this.tryNext(channelId);
    }
  }

  async onDone(channelId: string, submissionId: string): Promise<void> {
    const st = this.state(channelId);
    if (st.current?.id !== submissionId) return;
    if (st.watchdog) clearTimeout(st.watchdog);
    st.watchdog = null;
    st.current = null;

    await db
      .update(submissions)
      .set({ status: 'played', updatedAt: new Date() })
      .where(eq(submissions.id, submissionId));

    // Clear straggler overlay copies (multiple open tabs etc.).
    this.io.to(roomOf(channelId)).emit('media:skip', submissionId);
    this.io.to(dashboardRoomOf(channelId)).emit('playback:ended', submissionId);
    emitSubmissionStatus(this.io, submissionId, 'played');
    void this.tryNext(channelId);
  }

  /** Overlay reported real duration of current clip (YouTube). Reconfigure watchdog. */
  reportDuration(channelId: string, submissionId: string, durationMs: number): void {
    const st = this.state(channelId);
    // Overlay is only semi-trusted (overlayToken): clamp the value, else garbage/huge
    // numbers would arm the watchdog for a day. Past the limit, tryNext's grace watchdog stays.
    if (
      st.current?.id !== submissionId ||
      !Number.isFinite(durationMs) ||
      durationMs <= 0 ||
      durationMs > 12 * 60 * 60 * 1000
    )
      return;
    st.current.durationMs = durationMs;
    if (st.watchdog) clearTimeout(st.watchdog);
    st.watchdog = setTimeout(
      () => void this.onDone(channelId, submissionId),
      durationMs + config.watchdogGraceMs,
    );
    // "Now playing" panel gets the real time instead of zero (with nick color).
    // Re-check currency after the async color lookup: the clip may have ended meanwhile,
    // and a late emit would resurrect an already-ended submission on the dashboard.
    const cur = st.current;
    void toLiveSummary(cur).then((summary) => {
      if (this.state(channelId).current?.id === cur.id) {
        this.io.to(dashboardRoomOf(channelId)).emit('playback:started', summary);
      }
    });
  }

  private async tryNext(channelId: string): Promise<void> {
    const st = this.state(channelId);
    if (st.current || st.queue.length === 0 || this.overlayCount(channelId) === 0) return;

    while (st.queue.length > 0) {
      const candidate = st.queue.shift()!;
      // Status may have changed while the item waited in memory (e.g. expired).
      const fresh = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, candidate.id))
        .get();
      // Text, YouTube and GIF have no on-disk file (filePath=null) — that's normal for them
      // (GIF/YouTube render from a remote CDN, text has no media). Don't drop them as "fileless".
      const fileless = fresh?.kind === 'text' || fresh?.kind === 'youtube' || fresh?.kind === 'gif';
      if (!fresh || fresh.status !== 'approved' || (!fresh.filePath && !fileless)) continue;
      // Another tryNext call may have grabbed the slot during the DB round-trip.
      if (st.current) {
        st.queue.unshift(candidate);
        return;
      }

      st.current = fresh;
      this.io.to(roomOf(channelId)).emit('media:play', await this.buildPayload(fresh));
      this.io.to(dashboardRoomOf(channelId)).emit('playback:started', await toLiveSummary(fresh));
      emitSubmissionStatus(this.io, fresh.id, 'playing');
      // YouTube: duration is only known at play time (see reportDuration), so until
      // then keep a grace watchdog instead of durationMs (=0).
      const watchdogMs =
        fresh.kind === 'youtube'
          ? config.youtube.loadGraceMs
          : fresh.durationMs + config.watchdogGraceMs;
      st.watchdog = setTimeout(() => void this.onDone(channelId, fresh.id), watchdogMs);
      return;
    }
  }

  /** Connected OBS overlays for a channel; >0 doubles as our "stream is live" signal. */
  overlayCount(channelId: string): number {
    return this.io.sockets.adapter.rooms.get(roomOf(channelId))?.size ?? 0;
  }

  /** All channels with at least one overlay connected right now → channelId -> overlay count. */
  liveChannels(): Map<string, number> {
    const prefix = roomOf('');
    const out = new Map<string, number>();
    for (const [room, sockets] of this.io.sockets.adapter.rooms) {
      // Skip per-socket rooms (name === a socket id) and non-overlay rooms.
      if (!room.startsWith(prefix)) continue;
      out.set(room.slice(prefix.length), sockets.size);
    }
    return out;
  }

  private async buildPayload(sub: SubmissionRow): Promise<MediaPlayPayload> {
    const channel = await db
      .select({
        volume: channels.volume,
        showSenderName: channels.showSenderName,
        soundAlert: channels.soundAlert,
        ttsName: channels.ttsName,
        ttsMessage: channels.ttsMessage,
        overlayPosition: channels.overlayPosition,
        overlaySize: channels.overlaySize,
        overlayMargin: channels.overlayMargin,
        musicSeparate: channels.musicSeparate,
        musicPosition: channels.musicPosition,
        musicSize: channels.musicSize,
        musicMargin: channels.musicMargin,
      })
      .from(channels)
      .where(eq(channels.id, sub.channelId))
      .get();
    const showName = channel?.showSenderName ?? true;
    // Color/effects/badges are pointless without the name; resolve only when the name is shown.
    const marks = showName ? await senderMarksOf(sub.senderUserId) : { ...NO_MARKS, badges: [] };
    return {
      submissionId: sub.id,
      url: `/api/media/${sub.id}`,
      kind: sub.kind,
      durationMs: sub.durationMs,
      volume: channel?.volume ?? 100,
      sound: channel?.soundAlert ?? false,
      // TTS reads the name aloud; pointless if the name isn't shown.
      tts: (channel?.ttsName ?? false) && showName && sub.senderName !== null,
      senderName: showName ? (sub.senderName ?? undefined) : undefined,
      senderColor: marks.color ?? undefined,
      senderEffect: marks.nickEffect ?? undefined,
      senderCardEffect: marks.cardEffect ?? undefined,
      senderBadges: marks.badges.length ? marks.badges : undefined,
      text: sub.text ?? undefined,
      ttsText: (channel?.ttsMessage ?? false) && !!sub.text,
      // Music may use its own layout; the server picks it by media type, so the
      // overlay just applies position/size/margin from the payload.
      ...resolveLayout(sub.kind, channel, sub.mime === 'audio/youtube'),
      youtubeId: sub.youtubeId ?? undefined,
      youtubeStartSeconds: sub.youtubeStart,
      youtubeMusic: sub.mime === 'audio/youtube',
      giphyId: sub.giphyId ?? undefined,
    };
  }

  private state(channelId: string): ChannelState {
    let st = this.states.get(channelId);
    if (!st) {
      st = { queue: [], current: null, watchdog: null };
      this.states.set(channelId, st);
    }
    return st;
  }
}

/** Which layout to use for a media type: general (overlay*) or music (music*). */
function resolveLayout(
  kind: SubmissionRow['kind'],
  channel:
    | {
        overlayPosition: MediaPlayPayload['position'];
        overlaySize: number;
        overlayMargin: number;
        musicSeparate: boolean;
        musicPosition: MediaPlayPayload['position'];
        musicSize: number;
        musicMargin: number;
      }
    | null
    | undefined,
  isMusic = false,
): Pick<MediaPlayPayload, 'position' | 'size' | 'margin'> {
  if (!channel) return { position: 'center', size: 80, margin: 0 };
  // YouTube Music uses the music layout alongside audio files.
  const useMusic = (kind === 'audio' || isMusic) && channel.musicSeparate;
  return useMusic
    ? { position: channel.musicPosition, size: channel.musicSize, margin: channel.musicMargin }
    : {
        position: channel.overlayPosition,
        size: channel.overlaySize,
        margin: channel.overlayMargin,
      };
}

export function setupRealtime(io: RealtimeServer, app: FastifyInstance): PlaybackManager {
  const playback = new PlaybackManager(io);

  io.on('connection', (socket) => {
    void (async () => {
      try {
        const { role } = socket.handshake.query;

        // Viewer tracks their submission. No auth needed: the submission id is a
        // random UUID, and knowing it is the ticket into the room.
        if (role === 'viewer') {
          const submissionId = socket.handshake.query.submission;
          if (typeof submissionId !== 'string' || !submissionId) {
            socket.disconnect(true);
            return;
          }
          void socket.join(submissionRoomOf(submissionId));
          // Send current status immediately, in case the show happened before subscribing.
          const sub = await db
            .select({ status: submissions.status, channelId: submissions.channelId })
            .from(submissions)
            .where(eq(submissions.id, submissionId))
            .get();
          if (sub) {
            const playing = playback.getCurrent(sub.channelId)?.id === submissionId;
            socket.emit('submission:status', {
              submissionId,
              status: playing ? 'playing' : sub.status,
            });
          }
          return;
        }

        // Dashboard: auth via session cookie (moderators don't get the overlayToken).
        // Channel membership = owner OR a row in channel_moderators.
        if (role === 'dashboard') {
          const { channelId } = socket.handshake.query;
          if (typeof channelId !== 'string' || !channelId) {
            socket.disconnect(true);
            return;
          }
          const user = await getUserFromCookieHeader(socket.handshake.headers.cookie, (v) =>
            app.unsignCookie(v),
          );
          if (!user) {
            socket.disconnect(true);
            return;
          }
          const channel = await db
            .select({ ownerUserId: channels.ownerUserId })
            .from(channels)
            .where(eq(channels.id, channelId))
            .get();
          if (!channel) {
            socket.disconnect(true);
            return;
          }
          if (channel.ownerUserId !== user.id) {
            const mod = await db
              .select({ userId: channelModerators.userId })
              .from(channelModerators)
              .where(
                and(
                  eq(channelModerators.channelId, channelId),
                  eq(channelModerators.userId, user.id),
                ),
              )
              .get();
            if (!mod) {
              socket.disconnect(true);
              return;
            }
          }
          void socket.join(dashboardRoomOf(channelId));
          return;
        }

        // Overlay (OBS Browser Source can't do OAuth): channel secret token.
        if (role === 'overlay') {
          const { token } = socket.handshake.query;
          if (typeof token !== 'string' || token.length === 0) {
            socket.disconnect(true);
            return;
          }
          const channel = await db
            .select({
              id: channels.id,
              chatFontSize: channels.chatFontSize,
              chatFadeSeconds: channels.chatFadeSeconds,
            })
            .from(channels)
            .where(eq(channels.overlayToken, token))
            .get();
          if (!channel) {
            socket.disconnect(true);
            return;
          }
          void socket.join(roomOf(channel.id));
          // The chat overlay reads this on connect; the media overlay ignores it.
          socket.emit('chat:config', {
            fontSize: channel.chatFontSize,
            fadeSeconds: channel.chatFadeSeconds,
          });
          socket.on('playback:done', (submissionId) => {
            if (typeof submissionId === 'string') void playback.onDone(channel.id, submissionId);
          });
          socket.on('playback:duration', (submissionId, durationMs) => {
            if (typeof submissionId === 'string' && typeof durationMs === 'number') {
              playback.reportDuration(channel.id, submissionId, durationMs);
            }
          });
          void playback.onOverlayConnected(channel.id, (payload) =>
            socket.emit('media:play', payload),
          );
          return;
        }

        // Unknown role.
        socket.disconnect(true);
      } catch (err) {
        app.log.error({ err }, 'socket connection handler failed');
        socket.disconnect(true);
      }
    })();
  });

  return playback;
}
