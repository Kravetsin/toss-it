import { and, eq, inArray } from 'drizzle-orm';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { Server } from 'socket.io';
import {
  musicConfigFrom,
  type EquippedCosmetics,
  type LiveStatus,
  type MediaPlayPayload,
  type OverlayKind,
  type OverlayLayout,
  type OverlayLayouts,
  type OverlayPresence,
  type PlaybackSlot,
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
// Type-only: payout.ts imports roomOf from here, and a value import would close the cycle.
import type { Payouts } from './media/payout';
import { speakableText } from './tts';
import { getUserFromCookieHeader } from './auth';

export type RealtimeServer = Server<
  OverlayToServerEvents,
  ServerToOverlayEvents & ServerToDashboardEvents & ServerToViewerEvents
>;

export function roomOf(channelId: string): string {
  return `channel:${channelId}`;
}

/**
 * Overlays also join a room per source kind. The channel room is what we broadcast to; these exist
 * to count the two sources apart — a chat overlay alone must not look like somewhere to play media.
 */
export function overlayKindRoomOf(channelId: string, kind: OverlayKind): string {
  return `overlay:${kind}:${channelId}`;
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
  /** Card effect tint (#rrggbb); only meaningful for a colourable effect (butterflies). */
  cardEffectColor: string | null;
  cardEffectColor2: string | null;
  /** Border decoration on the card (e.g. 'frame-runner'); null = none. */
  frame: string | null;
  /** Tint for that frame from its colour upgrade; null = the brand mint. */
  frameColor: string | null;
  /** Small object the sender carries (e.g. 'seal-hourglass'); null = none. Own slot, not a frame. */
  seal: string | null;
  /** Seal tint (#rrggbb); only meaningful for a colourable seal. */
  sealColor: string | null;
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
  cardEffectColor: null,
  cardEffectColor2: null,
  frame: null,
  frameColor: null,
  seal: null,
  sealColor: null,
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
    // The colour stored FOR the equipped effect (per-effect map; see EquippedCosmetics.cardEffectColors).
    // Null unless that effect has a colour set — a plain effect has no entry and renders its own palette.
    cardEffectColor:
      (equipped?.cardEffect && equipped.cardEffectColors?.[equipped.cardEffect]) ?? null,
    cardEffectColor2:
      (equipped?.cardEffect && equipped.cardEffectColors2?.[equipped.cardEffect]) ?? null,
    frame: equipped?.frame ?? null,
    // The colour stored FOR the equipped frame (per-frame map; see EquippedCosmetics.frameColors).
    // Null unless that frame has a colour set — an untinted frame keeps the brand mint.
    frameColor: (equipped?.frame && equipped.frameColors?.[equipped.frame]) ?? null,
    seal: equipped?.seal ?? null,
    // The colour stored FOR the equipped seal (per-seal map; see EquippedCosmetics.sealColors). Null
    // unless that seal has a colour set — a plain seal has no entry and renders its own palette.
    sealColor: (equipped?.seal && equipped.sealColors?.[equipped.seal]) ?? null,
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
    senderCardEffectColor: marks.cardEffectColor,
    senderCardEffectColor2: marks.cardEffectColor2,
    senderFrame: marks.frame,
    senderFrameColor: marks.frameColor,
    senderSeal: marks.seal,
    senderSealColor: marks.sealColor,
    senderLevel,
    kind: sub.kind,
    mime: sub.mime,
    text: sub.text,
    durationMs: sub.durationMs,
    createdAt: sub.createdAt.getTime(),
    url: `/api/media/${sub.id}`,
    youtubeId: sub.youtubeId,
    giphyId: sub.giphyId,
    overlayPosition: sub.overlayPosition,
    overlaySize: sub.overlaySize,
    overlayMargin: sub.overlayMargin,
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
    if (e?.nickColor || e?.nickEffect || e?.cardEffect || e?.frame || e?.seal || e?.entrance)
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

/** One playing position on the overlay. Two of these per channel — see PlaybackSlot. */
interface SlotState {
  current: SubmissionRow | null;
  watchdog: NodeJS.Timeout | null;
  /** Streamer paused the current show — the auto-advance watchdog is off while true. */
  paused: boolean;
  /**
   * Last playback:progress from the overlay for `current` — proof it is genuinely still playing.
   * `at` is when the tick arrived, `movedAt` when the position last actually ADVANCED: the overlay
   * keeps ticking a frozen element at the same spot, so only the second one means "still playing".
   */
  progress: { at: number; movedAt: number; positionMs: number; submissionId: string } | null;
  /** Armed when a show starts; disarmed by the overlay's first tick. See onDeliveryUnconfirmed. */
  deliveryProbe: NodeJS.Timeout | null;
  /** Consecutive shows the overlay never confirmed — bounds retrying into a black hole. */
  undelivered: number;
}

/**
 * The queue is shared; what plays is per slot. One ordered list keeps a viewer's "you are Nth"
 * meaningful, while two slots stop a three-minute song from holding the screen against a gif.
 */
interface ChannelState {
  queue: SubmissionRow[];
  slots: Record<PlaybackSlot, SlotState>;
}

const SLOTS: PlaybackSlot[] = ['media', 'music'];

const emptySlot = (): SlotState => ({
  current: null,
  watchdog: null,
  paused: false,
  progress: null,
  deliveryProbe: null,
  undelivered: 0,
});

/**
 * Which slot a post plays in. Mirrors the anchor rule in resolveLayout deliberately — a post shown
 * in the compact player is exactly the one that may share the screen — but stays a separate
 * decision: with parallelSlots off everything funnels into one slot and still gets its own anchor,
 * which is precisely today's behaviour.
 */
export function slotOf(
  sub: Pick<SubmissionRow, 'kind' | 'mime'>,
  channel: { youtubeAsMusic: boolean; parallelSlots: boolean } | null | undefined,
): PlaybackSlot {
  if (!channel?.parallelSlots) return 'media';
  if (sub.kind === 'audio') return 'music';
  if (sub.kind === 'youtube') return channel.youtubeAsMusic ? 'music' : 'media';
  return 'media';
}

/**
 * How recently the overlay must have reported progress for the watchdog to treat it as alive. The
 * overlay ticks once a second, so this tolerates a few missed ticks.
 */
const PROGRESS_ALIVE_MS = 5_000;

/**
 * A show whose position stopped ADVANCING is stuck, not playing: a Giphy clip that froze on their
 * CDN, an upload the source cannot buffer. Nothing else reaps it — the overlay keeps ticking the
 * frozen element, which reads as alive and made the watchdog defer forever, so the streamer had to
 * skip dead air by hand.
 *
 * Deliberately NOT applied to YouTube: its player reports the MAIN video's time, which legitimately
 * sits still through an ad, and cutting a request for that would be worse than the stall.
 */
const stallable = (sub: SubmissionRow): boolean => sub.kind !== 'youtube';

/**
 * Per-channel playback queue, strictly one at a time: next item goes to the
 * overlay only after playback:done (or via watchdog if the overlay died mid-show).
 */
/** A submission's live spot in the play order — see PlaybackManager.queueState. */
export type QueueState = { playing: true } | { playing: false; position: number };

/** A live overlay socket as the admin panel sees it (see PlaybackManager.overlaySockets). */
export interface ConnectedOverlay {
  socketId: string;
  channelId: string;
  kind: OverlayKind;
  connectedAt: number;
  transport: string;
  build: string | null;
}

/**
 * How much of a YouTube request must actually have played for it to count as aired. A clip the
 * player accepted and then dropped (some region locks end the video instead of erroring) reports a
 * position of about zero, and a request nobody saw must not take the viewer's points.
 */
const AIRED_MIN_MS = 10_000;
/** Same, for a clip whose length we never learned — nothing to take a fraction of. */
const AIRED_MIN_UNKNOWN_MS = 5_000;

export class PlaybackManager {
  private states = new Map<string, ChannelState>();
  /** Per-channel slot routing (see routingOf); invalidated when settings are saved. */
  private routing = new Map<string, { youtubeAsMusic: boolean; parallelSlots: boolean }>();
  /** Set after construction (see setPayouts): dust and channel-point refunds ride on playback. */
  private payouts: Payouts | null = null;

  constructor(
    private io: RealtimeServer,
    // Playback decisions are invisible on stream when they go wrong (a skip just "happens"), so
    // recovery/adopt/advance paths log their reasoning; optional to keep tests/sims silent.
    private log?: FastifyBaseLogger,
  ) {}

  /** Wired in index.ts once the channel-points module exists (it is what refunds points). */
  setPayouts(payouts: Payouts): void {
    this.payouts = payouts;
  }

  /** Returns queue position (1 = next), counting whatever is already on screen. */
  enqueue(sub: SubmissionRow): number {
    const st = this.state(sub.channelId);
    st.queue.push(sub);
    const position = st.queue.length + this.occupied(sub.channelId).length;
    void this.tryNextAll(sub.channelId);
    void this.emitQueue(sub.channelId);
    return position;
  }

  /** Offer the queue to every free slot — the entry point for "something changed". */
  private async tryNextAll(channelId: string): Promise<void> {
    for (const slot of SLOTS) await this.tryNext(channelId, slot);
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
    if (this.slotShowing(channelId, submissionId)) return { playing: true };
    const idx = st.queue.findIndex((s) => s.id === submissionId);
    if (idx === -1) return null;
    // Counts both slots: with two shows up, the next in line is genuinely third.
    return { playing: false, position: idx + 1 + this.occupied(channelId).length };
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
    // Dropped before it ever aired — nobody earns, and points spent on it go back.
    await this.payouts?.settle(submissionId, 'failed');
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
    for (const id of ids) {
      await this.payouts?.settle(id, 'failed');
      emitSubmissionStatus(this.io, id, 'rejected');
    }
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
   * the process went down, so it is restored as `current` and the reconnecting overlay replays THAT
   * row from the top (see onOverlayConnected). Requeuing it instead is what used to hand the overlay
   * a different item — which on stream reads as the current post being skipped.
   */
  async recoverFromDb(): Promise<void> {
    const rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.status, 'approved'))
      .orderBy(submissions.createdAt)
      .all();
    // Keyed by channel AND slot: with two slots, two rows can legitimately have been mid-show.
    const started = new Map<string, SubmissionRow>();
    for (const row of rows) {
      if (!row.startedAt) {
        this.state(row.channelId).queue.push(row);
        continue;
      }
      const slot = slotOf(row, await this.routingOf(row.channelId));
      const key = `${row.channelId}:${slot}`;
      // More than one started row per slot only after an abnormal exit; the newest was on
      // screen, the rest already aired.
      const prev = started.get(key);
      if (prev && (prev.startedAt?.getTime() ?? 0) >= row.startedAt.getTime()) {
        await this.markPlayed(row.id);
        continue;
      }
      if (prev) await this.markPlayed(prev.id);
      started.set(key, row);
    }
    for (const [key, row] of started) {
      const [channelId, slot] = [
        key.slice(0, key.lastIndexOf(':')),
        key.slice(key.lastIndexOf(':') + 1) as PlaybackSlot,
      ];
      const remaining = this.remainingMs(row);
      if (remaining <= 0) {
        this.log?.info(
          { channelId, submissionId: row.id, durationMs: row.durationMs },
          'playback recovery: mid-show row must have ended during downtime, retiring',
        );
        await this.markPlayed(row.id);
        continue;
      }
      const st = this.state(channelId);
      this.log?.info(
        { channelId, slot, submissionId: row.id, remaining, queued: st.queue.length },
        'playback recovery: restored mid-show row as current',
      );
      st.slots[slot].current = row;
      // Backstop from the ORIGINAL start, not from now — a restart must not extend the clip.
      st.slots[slot].watchdog = setTimeout(
        () => void this.onDone(channelId, row.id, 'watchdog-recovery'),
        remaining,
      );
    }
  }

  getCurrent(channelId: string, slot: PlaybackSlot = 'media'): SubmissionRow | null {
    return this.state(channelId).slots[slot].current;
  }

  /** Everything on screen right now — the viewer status check and the dashboard both need both. */
  currentsOf(channelId: string): { slot: PlaybackSlot; sub: SubmissionRow }[] {
    const st = this.state(channelId);
    return SLOTS.filter((s) => st.slots[s].current).map((s) => ({
      slot: s,
      sub: st.slots[s].current!,
    }));
  }

  /** Streamer skips the show in one slot. true if something was playing there. */
  async skip(
    channelId: string,
    slot: PlaybackSlot = 'media',
    cause = 'streamer-skip',
  ): Promise<boolean> {
    const current = this.state(channelId).slots[slot].current;
    if (!current) return false;
    // Overlay gets media:skip and clears the screen; onDone advances the queue
    // regardless of whether the overlay is alive.
    this.io.to(roomOf(channelId)).emit('media:skip', current.id);
    await this.onDone(channelId, current.id, cause);
    return true;
  }

  /**
   * Skip whatever is on screen, media before music — the order chat means by "skip this". Returns
   * the slot that was skipped, or null if the screen was empty. The verdict a skip carries is
   * unchanged (see `aired`): who asked for it makes no difference to the sender's points.
   */
  async skipCurrent(channelId: string, cause: string): Promise<PlaybackSlot | null> {
    const busy = this.currentsOf(channelId)[0];
    if (!busy) return null;
    return (await this.skip(channelId, busy.slot, cause)) ? busy.slot : null;
  }

  /**
   * Pause the current show. The overlay freezes it and keeps reporting progress; we drop the
   * auto-advance watchdog (the overlay is alive and drives completion) so a paused item never
   * gets force-skipped. Resume re-arms a backstop watchdog. No-op if nothing is playing.
   */
  pause(channelId: string, slot: PlaybackSlot = 'media'): boolean {
    const sl = this.state(channelId).slots[slot];
    if (!sl.current || sl.paused) return false;
    sl.paused = true;
    if (sl.watchdog) clearTimeout(sl.watchdog);
    sl.watchdog = null;
    this.io.to(roomOf(channelId)).emit('media:control', 'pause', slot);
    return true;
  }

  resume(channelId: string, slot: PlaybackSlot = 'media'): boolean {
    const sl = this.state(channelId).slots[slot];
    if (!sl.current || !sl.paused) return false;
    sl.paused = false;
    const sub = sl.current;
    // Backstop only: normally the overlay's playback:done ends it first. YouTube uses its load grace.
    const watchdogMs =
      sub.kind === 'youtube' ? config.youtube.loadGraceMs : sub.durationMs + config.watchdogGraceMs;
    if (sl.watchdog) clearTimeout(sl.watchdog);
    sl.watchdog = setTimeout(
      () => void this.onDone(channelId, sub.id, 'watchdog-resume'),
      watchdogMs,
    );
    this.io.to(roomOf(channelId)).emit('media:control', 'resume', slot);
    return true;
  }

  /**
   * Seek the current show to `seconds` (video/audio/YouTube only — image/gif/text have no timeline).
   * Re-arms the backstop watchdog for the new remaining time so a seek backwards can't force-advance
   * the clip early. The overlay drives real completion; this is only the dead-overlay backstop.
   */
  seek(channelId: string, seconds: number, slot: PlaybackSlot = 'media'): boolean {
    const sl = this.state(channelId).slots[slot];
    const cur = sl.current;
    if (!cur) return false;
    if (cur.kind !== 'video' && cur.kind !== 'audio' && cur.kind !== 'youtube') return false;
    const pos = Math.max(0, seconds);
    if (!sl.paused && cur.durationMs > 0) {
      const remainingMs = Math.max(0, cur.durationMs - pos * 1000) + config.watchdogGraceMs;
      if (sl.watchdog) clearTimeout(sl.watchdog);
      sl.watchdog = setTimeout(
        () => void this.onDone(channelId, cur.id, 'watchdog-seek'),
        remainingMs,
      );
    }
    this.io.to(roomOf(channelId)).emit('media:seek', pos, slot);
    return true;
  }

  /**
   * An overlay (re)connected. ONE rule, deliberately: whatever is current starts over from the top.
   *
   * Earlier versions tried to let the overlay keep playing across a reconnect by matching what it
   * reported on screen. It worked only sometimes, and the half-adopted state left the two sides
   * disagreeing (the streamer's pause button stopped working). A restart is worse but always the
   * same, which is what a streamer can actually be told to expect after a deploy.
   *
   * Resuming at the position our own clock had reached was tried too, and is why this warning is
   * now twice as long: handing the YouTube player a start offset left it frozen on the offset
   * forever — a spinner on stream, and a slot that could never free itself. Whatever the next idea
   * here is, the clip that plays from zero is the one that always plays.
   *
   * `recovered` is the one exception, and it is not guesswork: socket.io vouches that this is the
   * same client back inside the recovery window with every missed event replayed to it, so the clip
   * on screen never stopped. On a link that blinks every minute, restarting there would mean a clip
   * that starts over forever and never finishes.
   */
  async onOverlayConnected(
    channelId: string,
    replayTo: (payload: MediaPlayPayload) => void,
    recovered = false,
    kind: OverlayKind = 'media',
  ): Promise<void> {
    // The chat overlay cannot show a post. It used to reach here anyway, which rebuilt the media
    // slot a SECOND time on every reconnect — and, worse, unpaused a show the streamer had paused.
    if (kind !== 'media') return;
    const st = this.state(channelId);
    for (const slot of SLOTS) {
      const sl = st.slots[slot];
      // A fresh overlay is a fresh chance for posts an earlier one failed to take (see the probe).
      sl.undelivered = 0;
      if (!sl.current) {
        void this.tryNext(channelId, slot);
        continue;
      }
      if (recovered) {
        this.log?.info(
          { channelId, slot, submissionId: sl.current.id },
          'playback: overlay recovered mid-show — keeping it on screen',
        );
        continue;
      }
      const sub = sl.current;
      this.log?.info(
        { channelId, slot, submissionId: sub.id },
        'playback: overlay (re)connected — restarting the current show from the top',
      );
      // The clip is starting over, so our clock must too: re-arm the backstop for the FULL length
      // and restamp startedAt. Without this a file clip keeps the watchdog left over from its first
      // run and gets cut mid-way, and the next restart would measure staleness from a start that
      // never was.
      sl.paused = false;
      sl.progress = null; // the clip starts over — pre-restart positions must not vouch for it
      sub.startedAt = new Date();
      await db
        .update(submissions)
        .set({ startedAt: sub.startedAt })
        .where(eq(submissions.id, sub.id));
      if (sl.watchdog) clearTimeout(sl.watchdog);
      sl.watchdog = setTimeout(
        () => void this.onDone(channelId, sub.id, 'watchdog-replay'),
        sub.durationMs > 0 ? sub.durationMs + config.watchdogGraceMs : config.youtube.loadGraceMs,
      );
      if (sl.deliveryProbe) clearTimeout(sl.deliveryProbe);
      sl.deliveryProbe = setTimeout(
        () => void this.onDeliveryUnconfirmed(channelId, sub.id),
        config.realtime.deliveryProbeMs,
      );
      replayTo(await this.buildPayload(sub, slot));
    }
  }

  /**
   * The last overlay for a channel dropped. A *paused* show carries no watchdog — pause() drops it
   * on the assumption the live overlay drives completion. With no overlay left, that assumption is
   * gone: the show would hang as `current` forever and get replayed from the top on every reconnect
   * (restarting the clip, audibly). Arm a backstop so an abandoned show self-completes.
   */
  onOverlayDisconnected(channelId: string): void {
    if (this.presence(channelId).media > 0) return;
    const st = this.state(channelId);
    for (const slot of SLOTS) {
      const sl = st.slots[slot];
      if (!sl.current) continue;
      // Still armed = the overlay never ticked for this show, so it was never on screen. Letting
      // the watchdog run its length out would file it as aired; requeue it for the next overlay.
      if (sl.deliveryProbe) {
        clearTimeout(sl.deliveryProbe);
        void this.onDeliveryUnconfirmed(channelId, sl.current.id);
        continue;
      }
      // Only the paused/watchdog-less strand needs rescuing; a playing show already has a watchdog
      // that will fire.
      if (sl.watchdog) continue;
      const sub = sl.current;
      const ms =
        sub.durationMs > 0 ? sub.durationMs + config.watchdogGraceMs : config.youtube.loadGraceMs;
      sl.watchdog = setTimeout(() => void this.onDone(channelId, sub.id, 'watchdog-orphaned'), ms);
    }
  }

  /**
   * Any tick for the current show — paused ones included — proves the overlay really got it and is
   * on screen. That is what disarms the delivery probe; noteProgress is about position, this is
   * about existence.
   */
  confirmDelivery(channelId: string, submissionId: string): void {
    const slot = this.slotShowing(channelId, submissionId);
    if (!slot) return;
    const sl = this.state(channelId).slots[slot];
    if (!sl.deliveryProbe) return;
    clearTimeout(sl.deliveryProbe);
    sl.deliveryProbe = null;
    sl.undelivered = 0;
  }

  /**
   * The overlay never acknowledged a show we started. It is not on screen and never was, so it must
   * go back to the queue rather than run its clock out and be marked aired — a post burnt into a
   * dead overlay is the one failure a viewer can neither see nor retry.
   */
  private async onDeliveryUnconfirmed(channelId: string, submissionId: string): Promise<void> {
    const slot = this.slotShowing(channelId, submissionId);
    if (!slot) return;
    const st = this.state(channelId);
    const sl = st.slots[slot];
    const sub = sl.current!;
    sl.undelivered += 1;
    this.log?.warn(
      { channelId, slot, submissionId, undelivered: sl.undelivered },
      'playback: overlay never confirmed the show — returning it to the queue',
    );
    sl.deliveryProbe = null;
    if (sl.watchdog) clearTimeout(sl.watchdog);
    sl.watchdog = null;
    sl.current = null;
    sl.progress = null;
    sl.paused = false;
    // Clear the start stamp too: it is what startup recovery reads as "was mid-show".
    sub.startedAt = null;
    await db.update(submissions).set({ startedAt: null }).where(eq(submissions.id, submissionId));
    st.queue.unshift(sub);
    this.io.to(dashboardRoomOf(channelId)).emit('playback:ended', submissionId, slot);
    emitSubmissionStatus(this.io, submissionId, 'approved');
    void this.emitQueue(channelId);
    // Retrying at once would just feed the same dead socket. Past a few tries, stop and wait for an
    // overlay to connect — that path retries on its own (onOverlayConnected).
    if (sl.undelivered < config.realtime.maxUndelivered) {
      setTimeout(
        () => void this.tryNext(channelId, slot).catch(() => {}),
        config.realtime.deliveryRetryMs,
      );
    }
  }

  /**
   * The overlay's live position for the current show. Recorded (not just relayed to dashboards) so
   * the watchdog can tell a dead overlay from one whose clock has drifted from ours.
   */
  noteProgress(channelId: string, submissionId: string, positionMs: number): void {
    const slot = this.slotShowing(channelId, submissionId);
    if (!slot || !Number.isFinite(positionMs)) return;
    const sl = this.state(channelId).slots[slot];
    const prev = sl.progress;
    const now = Date.now();
    const pos = Math.max(0, positionMs);
    // A tick proves the overlay is alive; only a MOVED position proves the show is. The margin
    // absorbs the rounding of a ~350ms tick without accepting a frozen frame as progress.
    const moved = !prev || prev.submissionId !== submissionId || pos > prev.positionMs + 250;
    sl.progress = { at: now, movedAt: moved ? now : prev.movedAt, positionMs: pos, submissionId };
    if (
      !sl.paused &&
      sl.current &&
      stallable(sl.current) &&
      now - sl.progress.movedAt > config.stallMs
    ) {
      this.log?.warn(
        { channelId, slot, submissionId, positionMs: pos, stalledMs: now - sl.progress.movedAt },
        'playback: show stopped advancing — treating it as stalled',
      );
      void this.onDone(channelId, submissionId, 'stalled');
    }
  }

  /**
   * A media element's own length, riding the progress tick. Adopted once, while the row still says
   * 0: a Giphy clip has no length in the Clips API, so the server had nothing but a blind load grace
   * to bound it with. Guarded because reportDuration re-arms the watchdog and pokes the dashboard —
   * neither belongs on every tick.
   */
  noteDuration(channelId: string, submissionId: string, durationMs: number): void {
    const slot = this.slotShowing(channelId, submissionId);
    if (!slot) return;
    const sl = this.state(channelId).slots[slot];
    if (!sl.current || sl.current.durationMs > 0) return;
    this.reportDuration(channelId, submissionId, durationMs);
  }

  async onDone(channelId: string, submissionId: string, cause = 'overlay-done'): Promise<void> {
    const slot = this.slotShowing(channelId, submissionId);
    if (!slot) return;
    const sl = this.state(channelId).slots[slot];

    // A watchdog exists to reap a DEAD overlay, never to cut a live one. Our clock drifts from the
    // scene's (a deploy restarts the clip, pause/resume shifts it, a stale OBS bundle ignores the
    // restart entirely) — so if the overlay is still ticking progress, defer and re-arm from its
    // REAL position. Every "track skipped mid-play by itself" incident traces back to this cut.
    const p = sl.progress;
    // Alive means the position is still MOVING. Deferring on the mere arrival of ticks is what let a
    // frozen show re-arm its own watchdog forever, since a stuck element keeps ticking in place.
    // YouTube keeps the looser rule: its position legitimately stands still through an ad.
    const aliveSince = sl.current && stallable(sl.current) ? p?.movedAt : p?.at;
    if (
      cause.startsWith('watchdog') &&
      p?.submissionId === submissionId &&
      aliveSince !== undefined &&
      Date.now() - aliveSince < PROGRESS_ALIVE_MS &&
      !sl.paused
    ) {
      const left =
        sl.current!.durationMs > 0
          ? Math.max(0, sl.current!.durationMs - p.positionMs) + config.watchdogGraceMs
          : config.youtube.loadGraceMs;
      this.log?.info(
        { channelId, slot, submissionId, cause, positionMs: p.positionMs, rearmMs: left },
        'playback: watchdog deferred — overlay is still reporting progress',
      );
      if (sl.watchdog) clearTimeout(sl.watchdog);
      sl.watchdog = setTimeout(() => void this.onDone(channelId, submissionId, cause), left);
      return;
    }

    const aired = this.aired(sl.current!, sl.progress, cause);
    this.log?.info({ channelId, slot, submissionId, cause, aired }, 'playback: show ended');
    if (sl.watchdog) clearTimeout(sl.watchdog);
    sl.watchdog = null;
    if (sl.deliveryProbe) clearTimeout(sl.deliveryProbe);
    sl.deliveryProbe = null;
    sl.current = null;
    sl.progress = null;

    await this.markPlayed(submissionId);
    // Dust and channel points ride on this verdict — see Payouts.settle.
    await this.payouts?.settle(submissionId, aired ? 'aired' : 'failed');

    // Clear straggler overlay copies (multiple open tabs etc.).
    this.io.to(roomOf(channelId)).emit('media:skip', submissionId);
    this.io.to(dashboardRoomOf(channelId)).emit('playback:ended', submissionId, slot);
    emitSubmissionStatus(this.io, submissionId, 'played');
    void this.tryNext(channelId, slot);
  }

  /**
   * Did this show really happen? Only YouTube can lie about it: the player accepts the video, the
   * frame stays black (region lock, age gate) and it ends at once — indistinguishable from a normal
   * finish except by how far the position got. Everything else we render ourselves, so it aired.
   */
  private aired(sub: SubmissionRow, progress: SlotState['progress'], cause: string): boolean {
    if (cause === 'overlay-error') return false;
    if (sub.kind !== 'youtube') return true;
    const positionMs = progress?.submissionId === sub.id ? progress.positionMs : 0;
    const need =
      sub.durationMs > 0 ? Math.min(AIRED_MIN_MS, sub.durationMs / 2) : AIRED_MIN_UNKNOWN_MS;
    return positionMs >= need;
  }

  /** Overlay reported real duration of current clip (YouTube). Reconfigure watchdog. */
  reportDuration(channelId: string, submissionId: string, durationMs: number): void {
    const slot = this.slotShowing(channelId, submissionId);
    // Overlay is only semi-trusted (overlayToken): clamp the value, else garbage/huge
    // numbers would arm the watchdog for a day. Past the limit, tryNext's grace watchdog stays.
    if (
      !slot ||
      !Number.isFinite(durationMs) ||
      durationMs <= 0 ||
      durationMs > 12 * 60 * 60 * 1000
    )
      return;
    const sl = this.state(channelId).slots[slot];
    sl.current!.durationMs = durationMs;
    // Persist it: startup recovery reads durationMs to decide whether a restored show is still
    // running. YouTube rows are often stored with 0 (no API key, or the lookup failed), which would
    // retire any track longer than the load grace on the next restart — the very skip we fixed.
    void db
      .update(submissions)
      .set({ durationMs })
      .where(eq(submissions.id, submissionId))
      .catch(() => {});
    if (sl.watchdog) clearTimeout(sl.watchdog);
    sl.watchdog = setTimeout(
      () => void this.onDone(channelId, submissionId, 'watchdog-duration'),
      durationMs + config.watchdogGraceMs,
    );
    // "Now playing" panel gets the real time instead of zero (with nick color).
    // Re-check currency after the async color lookup: the clip may have ended meanwhile,
    // and a late emit would resurrect an already-ended submission on the dashboard.
    const cur = sl.current!;
    void toLiveSummary(cur).then((summary) => {
      if (this.slotShowing(channelId, cur.id)) {
        this.io.to(dashboardRoomOf(channelId)).emit('playback:started', summary, slot);
      }
    });
  }

  /**
   * Fill one slot from the shared queue: the first waiting post that belongs to this slot, skipping
   * over posts meant for the other one. That skipping is the whole feature — a gif no longer waits
   * behind a three-minute song, because the song is not in its way.
   */
  private async tryNext(channelId: string, slot: PlaybackSlot): Promise<void> {
    const st = this.state(channelId);
    const sl = st.slots[slot];
    // Media source only: a channel running just the chat overlay has nowhere to show a post.
    if (sl.current || st.queue.length === 0 || this.presence(channelId).media === 0) return;
    const routing = await this.routingOf(channelId);

    for (;;) {
      const idx = st.queue.findIndex((s) => slotOf(s, routing) === slot);
      if (idx === -1) return;
      const [candidate] = st.queue.splice(idx, 1) as [SubmissionRow];
      // Status may have changed while the item waited in memory (e.g. expired).
      const fresh = await db
        .select()
        .from(submissions)
        .where(eq(submissions.id, candidate.id))
        .get();
      // Text, YouTube and anything Giphy-hosted have no on-disk file (filePath=null) — that's normal
      // for them (Giphy/YouTube render from a remote CDN, text has no media). A Giphy clip counts
      // here too: it is kind='video' with no stored file, so the giphyId is what makes it playable.
      const fileless =
        fresh?.kind === 'text' ||
        fresh?.kind === 'youtube' ||
        fresh?.kind === 'gif' ||
        !!fresh?.giphyId;
      if (!fresh || fresh.status !== 'approved' || (!fresh.filePath && !fileless)) continue;
      // Another tryNext call may have taken this slot during the DB round-trip.
      if (sl.current) {
        st.queue.splice(idx, 0, candidate);
        return;
      }

      sl.current = fresh;
      sl.paused = false;
      sl.progress = null; // the previous show's ticks must not vouch for this one
      // Persist BEFORE the overlay is told to play: this stamp is what a restarted server reads to
      // know the row was mid-show. Written first so a crash can't leave a playing item looking queued.
      fresh.startedAt = new Date();
      await db
        .update(submissions)
        .set({ startedAt: fresh.startedAt })
        .where(eq(submissions.id, fresh.id));
      this.io.to(roomOf(channelId)).emit('media:play', await this.buildPayload(fresh, slot));
      this.io
        .to(dashboardRoomOf(channelId))
        .emit('playback:started', await toLiveSummary(fresh), slot);
      emitSubmissionStatus(this.io, fresh.id, 'playing');
      void this.emitQueue(channelId); // the item just left the waiting queue

      // YouTube: duration is only known at play time (see reportDuration), so until
      // then keep a grace watchdog instead of durationMs (=0).
      const watchdogMs =
        fresh.kind === 'youtube'
          ? config.youtube.loadGraceMs
          : fresh.durationMs + config.watchdogGraceMs;
      sl.watchdog = setTimeout(
        () => void this.onDone(channelId, fresh.id, 'watchdog-start'),
        watchdogMs,
      );
      // A socket we still count as connected can be a dead OBS source (half-open TCP survives the
      // link dropping). Until the overlay ticks back, this post is not on screen — see the probe.
      sl.deliveryProbe = setTimeout(
        () => void this.onDeliveryUnconfirmed(channelId, fresh.id),
        config.realtime.deliveryProbeMs,
      );
      return;
    }
  }

  /** Connected OBS overlays for a channel, both sources; >0 doubles as our "stream is live" signal. */
  overlayCount(channelId: string): number {
    return this.io.sockets.adapter.rooms.get(roomOf(channelId))?.size ?? 0;
  }

  /**
   * Overlays by source. Only the media one can show a post, so it — not the total — decides whether
   * the queue may advance. A pre-kind overlay bundle reports nothing and counts as media, which is
   * exactly how it behaved before.
   */
  presence(channelId: string): OverlayPresence {
    const count = (kind: OverlayKind): number =>
      this.io.sockets.adapter.rooms.get(overlayKindRoomOf(channelId, kind))?.size ?? 0;
    return { media: count('media'), chat: count('chat') };
  }

  /** Tell the channel's dashboards which overlays are live right now. */
  emitPresence(channelId: string): void {
    this.io.to(dashboardRoomOf(channelId)).emit('overlay:presence', this.presence(channelId));
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

  /**
   * Every connected overlay socket, for the admin panel's targeted reload. Identity is read off the
   * socket itself (its kind room, its handshake) rather than a registry, so it cannot drift.
   */
  overlaySockets(): ConnectedOverlay[] {
    const out: ConnectedOverlay[] = [];
    for (const socket of this.io.sockets.sockets.values()) {
      if (socket.handshake.query.role !== 'overlay') continue;
      const room = [...socket.rooms].find((r) => r.startsWith('overlay:'));
      if (!room) continue;
      const [, kind, channelId] = room.split(':');
      if (!channelId) continue;
      const build = socket.handshake.query.v;
      out.push({
        socketId: socket.id,
        channelId,
        kind: kind === 'chat' ? 'chat' : 'media',
        connectedAt: socket.handshake.issued,
        transport: socket.conn.transport.name,
        build: typeof build === 'string' && build ? build : null,
      });
    }
    return out;
  }

  /** Tell one overlay to reload itself; false if that socket went away in the meantime. */
  reloadOverlay(socketId: string): boolean {
    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket || socket.handshake.query.role !== 'overlay') return false;
    socket.emit('overlay:reload');
    return true;
  }

  private async buildPayload(sub: SubmissionRow, slot: PlaybackSlot): Promise<MediaPlayPayload> {
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
        allowViewerPosition: channels.allowViewerPosition,
        youtubeAsMusic: channels.youtubeAsMusic,
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
      senderCardEffectColor: marks.cardEffectColor ?? undefined,
      senderCardEffectColor2: marks.cardEffectColor2 ?? undefined,
      senderFrame: marks.frame ?? undefined,
      senderFrameColor: marks.frameColor ?? undefined,
      senderSeal: marks.seal ?? undefined,
      senderSealColor: marks.sealColor ?? undefined,
      senderEntrance: marks.entrance ?? undefined,
      senderEntranceColor: marks.entranceColor ?? undefined,
      senderLevel: senderLevel || undefined,
      senderBadges: marks.badges.length ? marks.badges : undefined,
      text: sub.text ?? undefined,
      ttsText: (channel?.ttsMessage ?? false) && !!speakableText(sub.text ?? ''),
      slot,
      // Music may use its own layout; the server picks it by media type, so the
      // overlay just applies position/size/margin from the payload.
      ...resolveLayout(sub.kind, channel, sub.mime === 'audio/youtube', {
        position: sub.overlayPosition,
        size: sub.overlaySize,
        margin: sub.overlayMargin,
      }),
      youtubeId: sub.youtubeId ?? undefined,
      youtubeStartSeconds: sub.youtubeStart,
      youtubeMusic: sub.mime === 'audio/youtube',
      giphyId: sub.giphyId ?? undefined,
    };
  }

  private state(channelId: string): ChannelState {
    let st = this.states.get(channelId);
    if (!st) {
      st = { queue: [], slots: { media: emptySlot(), music: emptySlot() } };
      this.states.set(channelId, st);
    }
    return st;
  }

  /** The slot a submission is currently playing in, or null if it is not on screen. */
  private slotShowing(channelId: string, submissionId: string): PlaybackSlot | null {
    const st = this.states.get(channelId);
    if (!st) return null;
    return SLOTS.find((s) => st.slots[s].current?.id === submissionId) ?? null;
  }

  /** Shows on screen right now, in slot order. */
  private occupied(channelId: string): SubmissionRow[] {
    const st = this.states.get(channelId);
    if (!st) return [];
    return SLOTS.map((s) => st.slots[s].current).filter((c): c is SubmissionRow => c !== null);
  }

  /**
   * Routing settings, cached: tryNext runs on every queue event and must not read the channel row
   * each time. Dropped by invalidateRouting when the streamer saves settings.
   */
  private async routingOf(
    channelId: string,
  ): Promise<{ youtubeAsMusic: boolean; parallelSlots: boolean }> {
    const hit = this.routing.get(channelId);
    if (hit) return hit;
    const row = await db
      .select({ youtubeAsMusic: channels.youtubeAsMusic, parallelSlots: channels.parallelSlots })
      .from(channels)
      .where(eq(channels.id, channelId))
      .get();
    const value = {
      youtubeAsMusic: row?.youtubeAsMusic ?? true,
      parallelSlots: row?.parallelSlots ?? true,
    };
    this.routing.set(channelId, value);
    return value;
  }

  /** Settings were saved — the next post routes by the new rules. */
  invalidateRouting(channelId: string): void {
    this.routing.delete(channelId);
  }
}

/** Which layout to use for a media type: general (overlay*) or music (music*). */
export function resolveLayout(
  kind: SubmissionRow['kind'],
  channel:
    | {
        overlayPosition: MediaPlayPayload['position'];
        overlaySize: number;
        overlayMargin: number;
        allowViewerPosition: boolean;
        youtubeAsMusic: boolean;
        musicSeparate: boolean;
        musicPosition: MediaPlayPayload['position'];
        musicSize: number;
        musicMargin: number;
      }
    | null
    | undefined,
  isMusic = false,
  /** What the sender asked for, knob by knob; nulls mean "whatever the channel says". */
  viewer: {
    position?: MediaPlayPayload['position'] | null;
    size?: number | null;
    margin?: number | null;
  } | null = null,
): Pick<MediaPlayPayload, 'position' | 'size' | 'margin' | 'viewerLayout'> {
  if (!channel) return { position: 'center', size: 80, margin: 0 };
  // Uploaded audio has no picture, so it is always the compact player. Everything from YouTube
  // follows the channel's switch — deliberately overriding what we guessed the link was. Metadata
  // calls plenty of music videos "Entertainment" and plenty of talks "Music"; a streamer who says
  // "YouTube goes to the small player" means all of it, and predictable beats clever here. (The
  // guess still matters elsewhere — auto-approve treats songs and videos differently.)
  const isMusicKind = kind === 'audio' || (kind === 'youtube' ? channel.youtubeAsMusic : isMusic);
  if (!isMusicKind) {
    // The permission is read here, at play time, rather than trusted from the moment of the send:
    // a streamer who switches it off wants the queue that already piled up to come home too.
    const chosen: Partial<OverlayLayout> = {};
    if (channel.allowViewerPosition && viewer) {
      if (viewer.position != null) chosen.position = viewer.position;
      // The streamer's size is a hard ceiling, not a default: a corner is a nuisance at worst, but
      // an unbounded size lets one sender paint over the whole stream. Capped here rather than at
      // submit time, so lowering it also shrinks whatever is already waiting in the queue.
      if (viewer.size != null) chosen.size = Math.min(viewer.size, channel.overlaySize);
      if (viewer.margin != null) chosen.margin = viewer.margin;
    }
    const own = {
      position: channel.overlayPosition,
      size: channel.overlaySize,
      margin: channel.overlayMargin,
    };
    // Knob by knob: what the sender left alone keeps following the channel, here and on every
    // later layout change.
    const hasChoice = Object.keys(chosen).length > 0;
    return { ...own, ...chosen, viewerLayout: hasChoice ? chosen : undefined };
  }
  // Music size is always the compact music-player size — never the media's (which can be 80% of the
  // screen). Only position/margin follow musicSeparate: shared with media, or the music block.
  const anchor = channel.musicSeparate
    ? { position: channel.musicPosition, margin: channel.musicMargin }
    : { position: channel.overlayPosition, margin: channel.overlayMargin };
  return { ...anchor, size: channel.musicSize };
}

/**
 * Both anchors a channel currently defines, for pushing a layout change to a post already on screen
 * (see the 'media:layout' event). Derived from the same resolveLayout the play payload uses, so the
 * live update and the next post can never disagree about what the settings mean.
 */
export function overlayLayoutsOf(channel: Parameters<typeof resolveLayout>[1]): OverlayLayouts {
  return {
    media: resolveLayout('image', channel),
    music: resolveLayout('audio', channel),
    youtubeAsMusic: channel?.youtubeAsMusic ?? true,
  };
}

export function setupRealtime(io: RealtimeServer, app: FastifyInstance): PlaybackManager {
  const playback = new PlaybackManager(io, app.log);
  // When each source was last seen leaving, so a connect can log how long it was gone. In memory on
  // purpose: it is diagnostic only, and a restart is exactly when the number means nothing anyway.
  const lastSeen = new Map<string, number>();
  const seenKey = (channelId: string, kind: OverlayKind): string => `${channelId}:${kind}`;
  const offlineMsOf = (channelId: string, kind: OverlayKind): number | null => {
    const at = lastSeen.get(seenKey(channelId, kind));
    return at == null ? null : Date.now() - at;
  };

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
            // Either slot counts — the viewer only cares that their own post is on screen.
            const playing = playback
              .currentsOf(sub.channelId)
              .some((c) => c.sub.id === submissionId);
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
          // Presence is a live state, not a stream of changes: a dashboard opened mid-outage must
          // learn it right away, not on the next overlay event.
          socket.emit('overlay:presence', playback.presence(channelId));
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
          // Bundles older than the presence work send no kind; media is what they always were.
          const kind: OverlayKind = socket.handshake.query.kind === 'chat' ? 'chat' : 'media';
          void socket.join(roomOf(channel.id));
          void socket.join(overlayKindRoomOf(channel.id, kind));
          // The chat overlay reads this on connect; the media overlay ignores it.
          socket.emit('chat:config', {
            fontSize: channel.chatFontSize,
            fadeSeconds: channel.chatFadeSeconds,
            bgOpacity: channel.chatBgOpacity,
            compact: channel.chatCompact,
            radius: channel.chatRadius,
            showBadges: channel.chatShowBadges,
            showLevel: channel.chatShowLevel,
            roleBorders: channel.chatRoleBorders,
          });
          // The media overlay reads this on connect; the chat overlay ignores it.
          socket.emit('music:config', musicConfigFrom(channel));
          socket.on('playback:done', (submissionId, reason) => {
            if (typeof submissionId !== 'string') return;
            // 'error' = the player refused the clip; it never aired, whatever the queue thinks.
            void playback
              .onDone(
                channel.id,
                submissionId,
                reason === 'error' ? 'overlay-error' : 'overlay-done',
              )
              .catch((err) => app.log.error({ err, submissionId }, 'playback done failed'));
          });
          socket.on('playback:duration', (submissionId, durationMs) => {
            if (typeof submissionId === 'string' && typeof durationMs === 'number') {
              playback.reportDuration(channel.id, submissionId, durationMs);
            }
          });
          // Relay the current show's live position to the channel's dashboards (progress bar), and
          // record it: it is the watchdog's only proof the overlay is alive and still playing.
          socket.on('playback:progress', (p) => {
            if (p && typeof p.submissionId === 'string') {
              // Even a paused tick proves the post reached a live overlay.
              playback.confirmDelivery(channel.id, p.submissionId);
              // The element knows its own length even when we never did (a Giphy clip).
              if (typeof p.durationMs === 'number' && p.durationMs > 0) {
                playback.noteDuration(channel.id, p.submissionId, p.durationMs);
              }
              if (typeof p.positionMs === 'number' && !p.paused) {
                playback.noteProgress(channel.id, p.submissionId, p.positionMs);
              }
              io.to(dashboardRoomOf(channel.id)).emit('playback:progress', p);
            }
          });
          // Relay the overlay's music player state to the channel's dashboards.
          socket.on('music:state', (state) => {
            io.to(dashboardRoomOf(channel.id)).emit('music:state', state);
          });
          // What the PAGE went through, which our own disconnect log cannot know: whether it kept
          // failing to hand-shake, re-dialled a half-open socket, or had to reload itself to come back.
          socket.on('overlay:diag', (d) => {
            if (!d || typeof d !== 'object') return;
            app.log.info(
              {
                channelId: channel.id,
                kind,
                dropReason: String(d.reason ?? '').slice(0, 60),
                offlineMs: Number(d.offlineMs) || 0,
                attempts: Number(d.attempts) || 0,
                stalls: Number(d.stalls) || 0,
                reloadedBy: d.reloadedBy ? String(d.reloadedBy).slice(0, 40) : undefined,
              },
              'overlay diag',
            );
          });
          const connectedAt = Date.now();
          // Last overlay gone → rescue a paused show from stranding as `current` forever.
          // Rooms are left before this fires, so both calls already see the socket as gone.
          socket.on('disconnect', (reason) => {
            lastSeen.set(seenKey(channel.id, kind), Date.now());
            // Persisted twin of lastSeen, for the directory's "was live N ago" — that one must
            // survive a restart, and a write per source leaving is nothing next to chat traffic.
            void db
              .update(channels)
              .set({ lastLiveAt: new Date() })
              .where(eq(channels.id, channel.id))
              .catch((err: unknown) =>
                app.log.warn({ err, channelId: channel.id }, 'last-live stamp failed'),
              );
            // The one thing the logs could never answer after a "it started over by itself" report:
            // whether the link died (transport error/ping timeout) or the source was reloaded
            // (transport close on a short session) — the two look identical at the next connect.
            app.log.info(
              { channelId: channel.id, kind, reason, sessionMs: Date.now() - connectedAt },
              'overlay socket disconnected',
            );
            playback.onOverlayDisconnected(channel.id);
            playback.emitPresence(channel.id);
          });
          // offlineMs against recovered tells the two apart from the other side: a gap under the
          // recovery window that still came back recovered:false means a fresh page, not an outage.
          app.log.info(
            {
              channelId: channel.id,
              kind,
              recovered: socket.recovered,
              offlineMs: offlineMsOf(channel.id, kind),
            },
            'overlay socket connected',
          );
          playback.emitPresence(channel.id);
          // Caught deliberately: an unhandled rejection here takes the whole process down, and a
          // crashed server disconnects every overlay on it — the opposite of what this path is for.
          void playback
            .onOverlayConnected(
              channel.id,
              (payload) => socket.emit('media:play', payload),
              socket.recovered,
              kind,
            )
            .catch((err) =>
              app.log.error({ err, channelId: channel.id }, 'overlay connect failed'),
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
