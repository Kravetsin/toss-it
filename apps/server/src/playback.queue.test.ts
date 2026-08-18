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
  /** One OBS source (re)connecting, and whatever got replayed to that socket alone. */
  const reconnect = async (kind: 'media' | 'chat' = 'media', recovered = false) => {
    const replayed: MediaPlayPayload[] = [];
    await playback.onOverlayConnected(channelId, (p) => replayed.push(p), recovered, kind);
    await settle();
    return replayed;
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

  /**
   * What `!skip` and the skip reward both mean by "this": whatever the eye is on. With a song in
   * the corner and a video on the stage, chat is asking about the video — picking the song there
   * would silently kill the wrong post, and the buyer would have paid for it.
   */
  it('skips the media stage before the music player, and reports which it took', async () => {
    const song = await makeSubmission(channelId, youtubePatch());
    const picture = await makeSubmission(channelId);
    playback.enqueue(song);
    await settle();
    playback.enqueue(picture);
    await settle();

    expect(await playback.skipCurrent(channelId, 'vote-skip')).toBe('media');
    await settle();
    expect(playback.getCurrent(channelId, 'media')).toBeNull();
    expect(playback.getCurrent(channelId, 'music')?.id).toBe(song.id);

    // Nothing left on the stage — the song is now what "this" means.
    expect(await playback.skipCurrent(channelId, 'vote-skip')).toBe('music');
    await settle();
    expect(playback.getCurrent(channelId, 'music')).toBeNull();

    // An empty screen is not a failure to report, it is nothing to skip — the reward refunds on it.
    expect(await playback.skipCurrent(channelId, 'vote-skip')).toBeNull();
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

  it('advances the queue when a show keeps ticking but stops advancing (a frozen clip)', async () => {
    // The incident: a Giphy clip played ~2s, froze, and the overlay went on ticking the same
    // position — which read as alive, so the watchdog deferred itself over and over and the
    // streamer had to skip dead air by hand.
    const sub = await makeSubmission(channelId, { durationMs: 0 });
    playback.enqueue(sub);
    await settle();

    // Well before the blind load grace (60s) that would otherwise reap it: only the stall rule can
    // end it this early, which is what the test is here to prove.
    for (let elapsed = 0; elapsed < 20_000; elapsed += 2_000) {
      tick(sub.id, 2_000); // same position every time: stuck, not playing
      await advance(2_000);
    }

    expect(config.stallMs).toBeLessThan(20_000);
    expect(playback.getCurrent(channelId, 'media')).toBeNull();
  });

  it('leaves a stalled YouTube request alone — its position stands still through an ad', async () => {
    const song = await makeSubmission(channelId, youtubePatch({ durationMs: 240_000 }));
    playback.enqueue(song);
    await settle();

    for (let elapsed = 0; elapsed < 60_000; elapsed += 2_000) {
      tick(song.id, 0); // pre-roll: the player reports the main video at zero
      await advance(2_000);
    }

    expect(playback.getCurrent(channelId, 'music')?.id).toBe(song.id);
  });

  it('adopts a clip’s real length off the progress tick, so it is not bounded by a blind grace', async () => {
    const sub = await makeSubmission(channelId, { durationMs: 0 });
    playback.enqueue(sub);
    await settle();

    playback.noteDuration(channelId, sub.id, 6_000);
    expect(playback.getCurrent(channelId, 'media')?.durationMs).toBe(6_000);

    // Watchdog now runs on the real length instead of the YouTube load grace.
    await advance(6_000 + config.watchdogGraceMs + 500);
    expect(playback.getCurrent(channelId, 'media')).toBeNull();
  });

  it('restarts the current show from the top on reconnect, however far in it was', async () => {
    const song = await makeSubmission(channelId, youtubePatch({ durationMs: 240_000 }));
    playback.enqueue(song);
    await settle();
    tick(song.id, 50_000);
    await advance(9_000); // fifty seconds in, then the link is out for nine

    const replayed = await reconnect();

    // Whole clip, clock restamped to now. Replaying it at the position it had reached was tried
    // instead, and froze the YouTube player on the offset — see the note on onOverlayConnected.
    expect(replayed).toHaveLength(1);
    const row = await db.select().from(submissions).where(eq(submissions.id, song.id)).get();
    expect(row!.startedAt!.getTime()).toBe(Date.now());
  });

  it('leaves the media slot alone when the chat overlay reconnects', async () => {
    const song = await makeSubmission(channelId, youtubePatch({ durationMs: 240_000 }));
    playback.enqueue(song);
    await settle();
    tick(song.id, 30_000);
    playback.pause(channelId, 'music');

    const replayed = await reconnect('chat');

    // Nothing replayed, and the show is still paused — a chat source cannot show a post, so it has
    // no business rebuilding one (it used to, which is how a reconnect restarted the track twice).
    expect(replayed).toHaveLength(0);
    expect(playback.resume(channelId, 'music')).toBe(true);
  });

  it('leaves a show that never stopped alone when socket.io recovers the session', async () => {
    const song = await makeSubmission(channelId, youtubePatch({ durationMs: 240_000 }));
    playback.enqueue(song);
    await settle();
    tick(song.id, 30_000);

    const replayed = await reconnect('media', true);

    expect(replayed).toHaveLength(0);
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
