import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaPlayPayload } from '@tmw/shared';
import { fakeIo, makeChannel, makeSubmission, youtubePatch, type FakeIo } from '../test/fakes';
import { db } from './db/index';
import { submissions } from './db/schema';
import { PlaybackManager } from './playback';
import { config } from './config';

/**
 * The queue's invariants, with time under our control: the watchdog waits out a whole clip and the
 * delivery probe eight seconds, so without fake timers none of this is testable at all.
 *
 * Everything here failed in production at least once — a post burnt into a dead overlay, a live
 * show cut by its own watchdog, a gif stuck behind a three-minute song.
 */
describe('PlaybackManager', () => {
  let io: FakeIo;
  let playback: PlaybackManager;
  let channelId: string;

  const playsOf = (): MediaPlayPayload[] =>
    io.eventsOf('media:play').map((e) => e.args[0] as MediaPlayPayload);
  /**
   * Let the manager's awaited database work finish. setImmediate is deliberately NOT faked (see
   * useFakeTimers below), so yielding to it drains everything libsql has queued.
   */
  const settle = async () => {
    for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
  };
  const advance = async (ms: number) => {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
  };
  /** What a live overlay does every 350ms; this is what proves a show reached the screen. */
  const tick = (submissionId: string, positionMs = 20_000) => {
    playback.confirmDelivery(channelId, submissionId);
    playback.noteProgress(channelId, submissionId, positionMs);
  };

  beforeEach(async () => {
    // Fake only the clock the playback code schedules on. Faking setImmediate too would freeze the
    // database driver's own callbacks, and nothing would ever resolve.
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    io = fakeIo();
    playback = new PlaybackManager(io.io);
    channelId = await makeChannel();
    io.connectOverlay(channelId);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('plays an approved post and reports which slot it went to', async () => {
    const sub = await makeSubmission(channelId);
    playback.enqueue(sub);
    await settle();

    expect(playsOf()).toHaveLength(1);
    expect(playsOf()[0]!.slot).toBe('media');
    expect(playback.getCurrent(channelId, 'media')?.id).toBe(sub.id);
  });

  it('holds the queue while no overlay is connected', async () => {
    io.disconnectOverlays(channelId);
    playback.enqueue(await makeSubmission(channelId));
    await settle();

    expect(playsOf()).toHaveLength(0);
  });

  it('lets an image play alongside a song instead of queueing behind it', async () => {
    const song = await makeSubmission(channelId, youtubePatch());
    const picture = await makeSubmission(channelId);
    playback.enqueue(song);
    await settle();
    playback.enqueue(picture);
    await settle();

    const slots = playsOf().map((p) => p.slot);
    expect(slots).toEqual(['music', 'media']);
    expect(playback.getCurrent(channelId, 'music')?.id).toBe(song.id);
    expect(playback.getCurrent(channelId, 'media')?.id).toBe(picture.id);
  });

  it('skips over posts meant for the other slot when filling one', async () => {
    // Two songs then a picture: the media slot must reach past both songs for the picture.
    playback.enqueue(await makeSubmission(channelId, youtubePatch()));
    playback.enqueue(await makeSubmission(channelId, youtubePatch()));
    const picture = await makeSubmission(channelId);
    playback.enqueue(picture);
    await settle();

    expect(playback.getCurrent(channelId, 'media')?.id).toBe(picture.id);
  });

  it('returns a post to the queue when the overlay never confirms it', async () => {
    const sub = await makeSubmission(channelId);
    playback.enqueue(sub);
    await settle();
    expect(playback.getCurrent(channelId, 'media')?.id).toBe(sub.id);

    // No ticks: the socket is connected but the OBS source is dead (half-open TCP).
    await advance(config.realtime.deliveryProbeMs + 100);

    expect(playback.getCurrent(channelId, 'media')).toBeNull();
    expect(playback.queueState(channelId, sub.id)).toEqual({ playing: false, position: 1 });
    // And it must NOT have been filed as aired.
    const row = await db.select().from(submissions).where(eq(submissions.id, sub.id)).get();
    expect(row?.status).toBe('approved');
    expect(row?.startedAt).toBeNull();
  });

  it('keeps a confirmed show; the probe only reaps silent ones', async () => {
    const sub = await makeSubmission(channelId);
    playback.enqueue(sub);
    await settle();
    tick(sub.id, 1_000);

    await advance(config.realtime.deliveryProbeMs + 100);

    expect(playback.getCurrent(channelId, 'media')?.id).toBe(sub.id);
  });

  it('does not let the watchdog cut a show that is still reporting progress', async () => {
    const sub = await makeSubmission(channelId, { durationMs: 10_000 });
    playback.enqueue(sub);
    await settle();

    // Tick past the point the watchdog would have fired, as a playing overlay would.
    for (let elapsed = 0; elapsed < 30_000; elapsed += 2_000) {
      tick(sub.id, elapsed);
      await advance(2_000);
    }

    expect(playback.getCurrent(channelId, 'media')?.id).toBe(sub.id);
  });

  it('advances the queue when the overlay stops reporting (a dead one)', async () => {
    const sub = await makeSubmission(channelId, { durationMs: 10_000 });
    playback.enqueue(sub);
    await settle();
    tick(sub.id, 1_000); // confirmed delivery, then silence

    await advance(10_000 + config.watchdogGraceMs + 6_000);

    expect(playback.getCurrent(channelId, 'media')).toBeNull();
    const row = await db.select().from(submissions).where(eq(submissions.id, sub.id)).get();
    expect(row?.status).toBe('played');
  });

  it('finishing one slot leaves the other playing', async () => {
    const song = await makeSubmission(channelId, youtubePatch());
    const picture = await makeSubmission(channelId);
    playback.enqueue(song);
    playback.enqueue(picture);
    await settle();
    tick(song.id);
    tick(picture.id);

    await playback.onDone(channelId, picture.id);
    await settle();

    expect(playback.getCurrent(channelId, 'media')).toBeNull();
    expect(playback.getCurrent(channelId, 'music')?.id).toBe(song.id);
  });

  it('counts both stages in a viewer’s queue position', async () => {
    playback.enqueue(await makeSubmission(channelId, youtubePatch()));
    playback.enqueue(await makeSubmission(channelId));
    const waiting = await makeSubmission(channelId);
    playback.enqueue(waiting);
    await settle();

    // Two shows on screen, so the next one in line is genuinely third.
    expect(playback.queueState(channelId, waiting.id)).toEqual({ playing: false, position: 3 });
  });

  it('routes everything into one slot when parallel playback is off', async () => {
    const single = await makeChannel({ parallelSlots: false });
    io.connectOverlay(single);
    const song = await makeSubmission(single, youtubePatch());
    const picture = await makeSubmission(single);
    playback.enqueue(song);
    await settle();
    playback.enqueue(picture);
    await settle();

    expect(playback.getCurrent(single, 'music')).toBeNull();
    expect(playback.getCurrent(single, 'media')?.id).toBe(song.id);
    // The picture waits its turn, exactly as before parallel slots existed.
    expect(playback.queueState(single, picture.id)).toEqual({ playing: false, position: 2 });
  });
});
