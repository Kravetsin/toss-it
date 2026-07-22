import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import {
  musicConfigFrom,
  type EquippedCosmetics,
  type LiveStatus,
  type MediaPlayPayload,
  type OverlayToServerEvents,
  type ServerToDashboardEvents,
  type ServerToOverlayEvents,
  type ServerToViewerEvents,
  type SubmissionSummary,
} from '@tmw/shared';
import { db } from './db/index';
import { channelModerators, channels, submissions, users, type SubmissionRow } from './db/schema';
import { config } from './config';
import { levelForSender } from './level';
import { speakableText } from './tts';
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

/** A sender's equipped cosmetics (nick color + gradient stop + nick effect + card effect). */
export interface NickMarks {
  color: string | null;
  /** Second gradient stop; only meaningful together with `color`. */
  color2: string | null;
  /** Whether the gradient drifts (nick-flow). */
  flow: boolean;
  nickEffect: string | null;
  cardEffect: string | null;
  /** Border decoration on the card (e.g. 'frame-runner'); null = none. */
  frame: string | null;
  /** How the alert arrives on stage; null = the stage's own pop-in. */
  entrance: string | null;
  /** Portal entrance tint (#rrggbb); only set when `entrance` is the portal. */
  entranceColor: string | null;
}
const NO_MARKS: NickMarks = {
  color: null,
  color2: null,
  flow: false,
  nickEffect: null,
  cardEffect: null,
  frame: null,
  entrance: null,
  entranceColor: null,
};

/**
 * The one place equipped cosmetics become the marks a summary/alert carries. Exported because two
 * routes used to hand-roll this object literal, which is how they silently stayed on four fields
 * while the type grew a fifth.
 */
export function marksFromEquipped(equipped: EquippedCosmetics | null): NickMarks {
  return {
    color: equipped?.nickColor ?? null,
    color2: equipped?.nickColor2 ?? null,
    flow: equipped?.nickFlow ?? false,
    nickEffect: equipped?.nickEffect ?? null,
    cardEffect: equipped?.cardEffect ?? null,
    frame: equipped?.frame ?? null,
    entrance: equipped?.entrance ?? null,
    // Tints WHICHEVER entrance is equipped (see entrance-portal-color): it used to be portal-only,
    // which silently starved every other colourable entrance of the viewer's chosen colour.
    entranceColor: equipped?.entranceColor ?? null,
  };
}

export function toSummary(
  sub: SubmissionRow,
  marks: NickMarks = NO_MARKS,
  senderLevel = 0,
): SubmissionSummary {
  return {
    id: sub.id,
    senderUserId: sub.senderUserId,
    senderName: sub.senderName,
    senderColor: marks.color,
    senderColor2: marks.color2,
    senderNickFlow: marks.flow,
    senderEffect: marks.nickEffect,
    senderCardEffect: marks.cardEffect,
    senderFrame: marks.frame,
    senderLevel,
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
    if (e?.nickColor || e?.nickEffect || e?.cardEffect || e?.frame || e?.entrance)
      out.set(r.id, marksFromEquipped(e));
    // nickColor2 needs no check of its own: it is only ever set alongside nickColor.
  }
  return out;
}

/** toSummary with the sender's equipped marks + level resolved (for live socket emits). */
export async function toLiveSummary(sub: SubmissionRow): Promise<SubmissionSummary> {
  const [marks, senderLevel] = await Promise.all([
    equippedMarksOf(sub.senderUserId),
    levelForSender(sub.channelId, sub.senderUserId),
  ]);
  return toSummary(sub, marks, senderLevel);
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
  /** Streamer paused the current show — the auto-advance watchdog is off while true. */
  paused: boolean;
  /**
   * `current` came from startup recovery, not from this process starting it — so nothing has
   * confirmed it is still on any screen. Cleared by the first overlay to report in.
   */
  restored: boolean;
}

/**
 * Per-channel playback queue, strictly one at a time: next item goes to the
 * overlay only after playback:done (or via watchdog if the overlay died mid-show).
 */
/** A submission's live spot in the play order — see PlaybackManager.queueState. */
export type QueueState = { playing: true } | { playing: false; position: number };

export class PlaybackManager {
  private states = new Map<string, ChannelState>();

  constructor(private io: RealtimeServer) {}

  /** Returns queue position (1 = next). */
  enqueue(sub: SubmissionRow): number {
    const st = this.state(sub.channelId);
    st.queue.push(sub);
    const position = st.queue.length + (st.current ? 1 : 0);
    void this.tryNext(sub.channelId);
    void this.emitQueue(sub.channelId);
    return position;
  }

  /**
   * Where a submission sits from its sender's point of view: on screen now, or Nth in line.
   * Null when it is in neither — awaiting moderation, already played, or dropped. Position counts
   * the current show, so position 1 means nothing is ahead and 2 means the thing on screen is.
   */
  queueState(channelId: string, submissionId: string): QueueState | null {
    // states.get, not state(): this is a read, and state() would allocate an empty ChannelState
    // for every channel a viewer ever asks about.
    const st = this.states.get(channelId);
    if (!st) return null;
    if (st.current?.id === submissionId) return { playing: true };
    const idx = st.queue.findIndex((s) => s.id === submissionId);
    if (idx === -1) return null;
    return { playing: false, position: idx + 1 + (st.current ? 1 : 0) };
  }

  /** Waiting items (not the current show), in play order, as dashboard summaries. */
  async queueSummaries(channelId: string): Promise<SubmissionSummary[]> {
    return Promise.all(this.state(channelId).queue.map((s) => toLiveSummary(s)));
  }

  /** Push the current waiting queue to the channel's dashboards. */
  private async emitQueue(channelId: string): Promise<void> {
    const queue = await this.queueSummaries(channelId);
    this.io.to(dashboardRoomOf(channelId)).emit('playback:queue', queue);
  }

  /**
   * Reorder the waiting queue to match `orderedIds` (the current show is untouched). Ids not in the
   * queue are ignored; queued items missing from the list keep their order at the tail (e.g. an item
   * enqueued mid-reorder). No-op with fewer than two waiting items.
   */
  reorderQueue(channelId: string, orderedIds: string[]): boolean {
    const st = this.state(channelId);
    if (st.queue.length < 2) return false;
    const byId = new Map(st.queue.map((s) => [s.id, s]));
    const next: SubmissionRow[] = [];
    for (const id of orderedIds) {
      const s = byId.get(id);
      if (s) {
        next.push(s);
        byId.delete(id);
      }
    }
    for (const s of st.queue) if (byId.has(s.id)) next.push(s);
    st.queue = next;
    void this.emitQueue(channelId);
    return true;
  }

  /** Streamer drops a waiting item from the queue (never the current show). Marks it rejected so it
   *  won't play. Returns false if it wasn't in the waiting queue. */
  async removeFromQueue(channelId: string, submissionId: string): Promise<boolean> {
    const st = this.state(channelId);
    const idx = st.queue.findIndex((s) => s.id === submissionId);
    if (idx === -1) return false;
    st.queue.splice(idx, 1);
    await db
      .update(submissions)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(submissions.id, submissionId));
    emitSubmissionStatus(this.io, submissionId, 'rejected');
    void this.emitQueue(channelId);
    return true;
  }

  /** Streamer clears the whole waiting queue (the current show keeps playing). Returns the count. */
  async clearQueue(channelId: string): Promise<number> {
    const st = this.state(channelId);
    if (st.queue.length === 0) return 0;
    const ids = st.queue.splice(0, st.queue.length).map((s) => s.id);
    await db
      .update(submissions)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(inArray(submissions.id, ids));
    for (const id of ids) emitSubmissionStatus(this.io, id, 'rejected');
    void this.emitQueue(channelId);
    return ids.length;
  }

  /** Mark a submission as aired. Shared by onDone and startup recovery. */
  private async markPlayed(submissionId: string): Promise<void> {
    await db
      .update(submissions)
      .set({ status: 'played', updatedAt: new Date() })
      .where(eq(submissions.id, submissionId));
  }

  /**
   * Backstop time left for a show that began at startedAt. <= 0 means it must be over by now, so
   * recovery retires it instead of resurrecting it.
   */
  private remainingMs(sub: SubmissionRow): number {
    // Known length: honour the ORIGINAL clock, so a restart cannot extend the clip.
    if (sub.durationMs > 0) {
      return (
        sub.durationMs + config.watchdogGraceMs - (Date.now() - (sub.startedAt?.getTime() ?? 0))
      );
    }
    // Length unknown (a YouTube row whose duration never reached the DB): elapsed time proves
    // nothing, so never retire on it — let the reconnecting overlay say whether it is still on
    // screen. This grace only bounds how long it may block the queue if no overlay claims it.
    return config.youtube.loadGraceMs;
  }

  /**
   * On server start, rebuild playback state from the DB. A row carrying startedAt was mid-show when
   * the process went down: it is restored as `current` SILENTLY — the overlay's browser kept playing
   * it across the outage and adopts it on reconnect (see onOverlayConnected). Requeuing it instead
   * is what used to hand the overlay a different item, which reads on stream as a skip.
   */
  async recoverFromDb(): Promise<void> {
    const rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.status, 'approved'))
      .orderBy(submissions.createdAt)
      .all();
    const started = new Map<string, SubmissionRow>();
    for (const row of rows) {
      if (!row.startedAt) {
        this.state(row.channelId).queue.push(row);
        continue;
      }
      // More than one started row per channel only after an abnormal exit; the newest was on
      // screen, the rest already aired.
      const prev = started.get(row.channelId);
      if (prev && (prev.startedAt?.getTime() ?? 0) >= row.startedAt.getTime()) {
        await this.markPlayed(row.id);
        continue;
      }
      if (prev) await this.markPlayed(prev.id);
      started.set(row.channelId, row);
    }
    for (const [channelId, row] of started) {
      const remaining = this.remainingMs(row);
      if (remaining <= 0) {
        await this.markPlayed(row.id);
        continue;
      }
      const st = this.state(channelId);
      st.current = row;
      st.restored = true;
      // Backstop from the ORIGINAL start, not from now — a restart must not extend the clip.
      st.watchdog = setTimeout(() => void this.onDone(channelId, row.id), remaining);
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

  /**
   * Pause the current show. The overlay freezes it and keeps reporting progress; we drop the
   * auto-advance watchdog (the overlay is alive and drives completion) so a paused item never
   * gets force-skipped. Resume re-arms a backstop watchdog. No-op if nothing is playing.
   */
  pause(channelId: string): boolean {
    const st = this.state(channelId);
    if (!st.current || st.paused) return false;
    st.paused = true;
    if (st.watchdog) clearTimeout(st.watchdog);
    st.watchdog = null;
    this.io.to(roomOf(channelId)).emit('media:control', 'pause');
    return true;
  }

  resume(channelId: string): boolean {
    const st = this.state(channelId);
    if (!st.current || !st.paused) return false;
    st.paused = false;
    const sub = st.current;
    // Backstop only: normally the overlay's playback:done ends it first. YouTube uses its load grace.
    const watchdogMs =
      sub.kind === 'youtube' ? config.youtube.loadGraceMs : sub.durationMs + config.watchdogGraceMs;
    if (st.watchdog) clearTimeout(st.watchdog);
    st.watchdog = setTimeout(() => void this.onDone(channelId, sub.id), watchdogMs);
    this.io.to(roomOf(channelId)).emit('media:control', 'resume');
    return true;
  }

  /**
   * Seek the current show to `seconds` (video/audio/YouTube only — image/gif/text have no timeline).
   * Re-arms the backstop watchdog for the new remaining time so a seek backwards can't force-advance
   * the clip early. The overlay drives real completion; this is only the dead-overlay backstop.
   */
  seek(channelId: string, seconds: number): boolean {
    const st = this.state(channelId);
    const cur = st.current;
    if (!cur) return false;
    if (cur.kind !== 'video' && cur.kind !== 'audio' && cur.kind !== 'youtube') return false;
    const pos = Math.max(0, seconds);
    if (!st.paused && cur.durationMs > 0) {
      const remainingMs = Math.max(0, cur.durationMs - pos * 1000) + config.watchdogGraceMs;
      if (st.watchdog) clearTimeout(st.watchdog);
      st.watchdog = setTimeout(() => void this.onDone(channelId, cur.id), remainingMs);
    }
    this.io.to(roomOf(channelId)).emit('media:seek', pos);
    return true;
  }

  /**
   * `nowPlaying` is what the overlay says is on its screen right now (null = nothing / an older
   * overlay build that doesn't report it).
   */
  async onOverlayConnected(
    channelId: string,
    nowPlaying: string | null,
    replayTo: (payload: MediaPlayPayload) => void,
  ): Promise<void> {
    const st = this.state(channelId);
    if (!st.current) {
      void this.tryNext(channelId);
      return;
    }
    // Still showing this exact item — a redeploy or a brief network drop, through which the browser
    // kept playing. Adopt it: replaying would rebuild the card and restart the clip from zero.
    if (nowPlaying === st.current.id) {
      st.restored = false;
      return;
    }
    if (st.restored) {
      st.restored = false;
      // Recovered a show the overlay's screen does not have: it ended during the outage (its
      // playback:done never reached us) or OBS restarted. Advance instead of replaying — nobody
      // wants a finished track, or a five-minute song, restarted from zero mid-stream.
      if (!nowPlaying) {
        await this.onDone(channelId, st.current.id);
        return;
      }
    }
    replayTo(await this.buildPayload(st.current));
  }

  /**
   * The last overlay for a channel dropped. A *paused* show carries no watchdog — pause() drops it
   * on the assumption the live overlay drives completion. With no overlay left, that assumption is
   * gone: the show would hang as `current` forever and get replayed from the top on every reconnect
   * (restarting the clip, audibly). Arm a backstop so an abandoned show self-completes.
   */
  onOverlayDisconnected(channelId: string): void {
    const st = this.state(channelId);
    // Only the paused/watchdog-less strand needs rescuing; a playing show already has a watchdog
    // that will fire. Skip if another overlay is still connected — it drives completion.
    if (!st.current || st.watchdog || this.overlayCount(channelId) > 0) return;
    const sub = st.current;
    const ms =
      sub.durationMs > 0 ? sub.durationMs + config.watchdogGraceMs : config.youtube.loadGraceMs;
    st.watchdog = setTimeout(() => void this.onDone(channelId, sub.id), ms);
  }

  async onDone(channelId: string, submissionId: string): Promise<void> {
    const st = this.state(channelId);
    if (st.current?.id !== submissionId) return;
    if (st.watchdog) clearTimeout(st.watchdog);
    st.watchdog = null;
    st.current = null;

    await this.markPlayed(submissionId);

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
    // Persist it: startup recovery reads durationMs to decide whether a restored show is still
    // running. YouTube rows are often stored with 0 (no API key, or the lookup failed), which would
    // retire any track longer than the load grace on the next restart — the very skip we fixed.
    void db
      .update(submissions)
      .set({ durationMs })
      .where(eq(submissions.id, submissionId))
      .catch(() => {});
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
      st.paused = false;
      st.restored = false; // this process started it, so its state is known-good
      // Persist BEFORE the overlay is told to play: this stamp is what a restarted server reads to
      // know the row was mid-show. Written first so a crash can't leave a playing item looking queued.
      fresh.startedAt = new Date();
      await db
        .update(submissions)
        .set({ startedAt: fresh.startedAt })
        .where(eq(submissions.id, fresh.id));
      this.io.to(roomOf(channelId)).emit('media:play', await this.buildPayload(fresh));
      this.io.to(dashboardRoomOf(channelId)).emit('playback:started', await toLiveSummary(fresh));
      emitSubmissionStatus(this.io, fresh.id, 'playing');
      void this.emitQueue(channelId); // the item just left the waiting queue

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
    // Color/effects/badges/level are pointless without the name; resolve only when the name is shown.
    const marks = showName ? await senderMarksOf(sub.senderUserId) : { ...NO_MARKS, badges: [] };
    const senderLevel = showName ? await levelForSender(sub.channelId, sub.senderUserId) : 0;
    return {
      submissionId: sub.id,
      url: `/api/media/${sub.id}`,
      kind: sub.kind,
      // YouTube stores its real length for dashboard display, but the overlay must not hard-cap on
      // it (buffering/ads make wall-clock > length → early cut) — it finishes on the 'ended' event.
      durationMs: sub.kind === 'youtube' ? 0 : sub.durationMs,
      volume: channel?.volume ?? 100,
      sound: channel?.soundAlert ?? false,
      // TTS reads the name aloud; pointless if the name isn't shown — or if no voice can
      // pronounce it (a YouTube title in kana would be spelled out character by character).
      tts: (channel?.ttsName ?? false) && showName && !!speakableText(sub.senderName ?? ''),
      senderName: showName ? (sub.senderName ?? undefined) : undefined,
      senderColor: marks.color ?? undefined,
      senderColor2: marks.color2 ?? undefined,
      senderNickFlow: marks.flow || undefined,
      senderEffect: marks.nickEffect ?? undefined,
      senderCardEffect: marks.cardEffect ?? undefined,
      senderFrame: marks.frame ?? undefined,
      senderEntrance: marks.entrance ?? undefined,
      senderEntranceColor: marks.entranceColor ?? undefined,
      senderLevel: senderLevel || undefined,
      senderBadges: marks.badges.length ? marks.badges : undefined,
      text: sub.text ?? undefined,
      ttsText: (channel?.ttsMessage ?? false) && !!speakableText(sub.text ?? ''),
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
      st = { queue: [], current: null, watchdog: null, paused: false, restored: false };
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
  const isMusicKind = kind === 'audio' || isMusic; // YouTube Music counts alongside audio files.
  if (!isMusicKind) {
    return {
      position: channel.overlayPosition,
      size: channel.overlaySize,
      margin: channel.overlayMargin,
    };
  }
  // Music size is always the compact music-player size — never the media's (which can be 80% of the
  // screen). Only position/margin follow musicSeparate: shared with media, or the music block.
  const anchor = channel.musicSeparate
    ? { position: channel.musicPosition, margin: channel.musicMargin }
    : { position: channel.overlayPosition, margin: channel.overlayMargin };
  return { ...anchor, size: channel.musicSize };
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
            .select()
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
            showBadges: channel.chatShowBadges,
            showLevel: channel.chatShowLevel,
            roleBorders: channel.chatRoleBorders,
          });
          // The media overlay reads this on connect; the chat overlay ignores it.
          socket.emit('music:config', musicConfigFrom(channel));
          socket.on('playback:done', (submissionId) => {
            if (typeof submissionId === 'string') void playback.onDone(channel.id, submissionId);
          });
          socket.on('playback:duration', (submissionId, durationMs) => {
            if (typeof submissionId === 'string' && typeof durationMs === 'number') {
              playback.reportDuration(channel.id, submissionId, durationMs);
            }
          });
          // Relay the current show's live position to the channel's dashboards (progress bar).
          socket.on('playback:progress', (p) => {
            if (p && typeof p.submissionId === 'string') {
              io.to(dashboardRoomOf(channel.id)).emit('playback:progress', p);
            }
          });
          // Relay the overlay's music player state to the channel's dashboards.
          socket.on('music:state', (state) => {
            io.to(dashboardRoomOf(channel.id)).emit('music:state', state);
          });
          // Last overlay gone → rescue a paused show from stranding as `current` forever.
          socket.on('disconnect', () => playback.onOverlayDisconnected(channel.id));
          // Sent via handshake auth (not query) because socket.io re-evaluates auth on every
          // reconnect — this must reflect what is on screen NOW, not at page load.
          const nowPlaying: unknown = socket.handshake.auth?.nowPlaying;
          void playback.onOverlayConnected(
            channel.id,
            typeof nowPlaying === 'string' && nowPlaying ? nowPlaying : null,
            (payload) => socket.emit('media:play', payload),
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
