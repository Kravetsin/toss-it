import { describe, expect, it } from 'vitest';
import { resolveLayout, slotOf } from './playback';
import type { SubmissionRow } from './db/schema';

const post = (patch: Partial<SubmissionRow>): Pick<SubmissionRow, 'kind' | 'mime'> => ({
  kind: 'image',
  mime: 'image/png',
  ...patch,
});
const anchors = {
  overlayPosition: 'center' as const,
  overlaySize: 80,
  overlayMargin: 0,
  allowViewerPosition: false,
  musicSeparate: true,
  musicPosition: 'bottom-right' as const,
  musicSize: 20,
  musicMargin: 4,
};

describe('slotOf', () => {
  const routing = { youtubeAsMusic: true, parallelSlots: true };

  it('sends YouTube to the slot the channel switch chose', () => {
    expect(slotOf(post({ kind: 'youtube' }), routing)).toBe('music');
    expect(slotOf(post({ kind: 'youtube' }), { ...routing, youtubeAsMusic: false })).toBe('media');
  });

  it('always puts uploaded audio in the compact player — there is nothing to look at', () => {
    expect(slotOf(post({ kind: 'audio' }), routing)).toBe('music');
    expect(slotOf(post({ kind: 'audio' }), { ...routing, youtubeAsMusic: false })).toBe('music');
  });

  it('leaves everything else on the media stage', () => {
    for (const kind of ['image', 'video', 'text', 'gif'] as const) {
      expect(slotOf(post({ kind }), routing)).toBe('media');
    }
  });

  it('funnels everything into one slot when parallel playback is off', () => {
    const single = { youtubeAsMusic: true, parallelSlots: false };
    expect(slotOf(post({ kind: 'youtube' }), single)).toBe('media');
    expect(slotOf(post({ kind: 'audio' }), single)).toBe('media');
  });
});

/**
 * The slot and the anchor are decided by two different functions, and they have to agree: a post
 * that plays in the compact player must also be *anchored* there. This is the pairing that broke
 * when the YouTube switch was added, so it is checked directly.
 */
describe('resolveLayout agrees with slotOf', () => {
  for (const youtubeAsMusic of [true, false]) {
    it(`matches for every kind with the switch ${youtubeAsMusic ? 'on' : 'off'}`, () => {
      const channel = { ...anchors, youtubeAsMusic };
      for (const kind of ['image', 'video', 'text', 'gif', 'audio', 'youtube'] as const) {
        const slot = slotOf(post({ kind }), { youtubeAsMusic, parallelSlots: true });
        const layout = resolveLayout(kind, channel);
        const anchoredInMusic = layout.size === anchors.musicSize;
        expect(anchoredInMusic).toBe(slot === 'music');
      }
    });
  }

  it('never lets a sender outgrow the size the streamer set', () => {
    // Without this one troll takes the whole screen; the channel's own size is the ceiling.
    const channel = {
      ...anchors,
      allowViewerPosition: true,
      youtubeAsMusic: true,
      overlaySize: 40,
    };
    const layout = resolveLayout('image', channel, false, { size: 100 });
    expect(layout.size).toBe(40);
    expect(layout.viewerLayout).toEqual({ size: 40 });
  });

  it("honours the sender's own layout, but only on the media side", () => {
    const channel = { ...anchors, allowViewerPosition: true, youtubeAsMusic: true };
    const image = resolveLayout('image', channel, false, { position: 'top-left', size: 100 });
    expect(image.position).toBe('top-left');
    expect(image.size).toBe(anchors.overlaySize); // capped at the channel's own (80)
    // A knob the sender left alone keeps following the channel.
    expect(image.margin).toBe(anchors.overlayMargin);
    expect(image.viewerLayout).toEqual({ position: 'top-left', size: anchors.overlaySize });
    // The compact player is the streamer's alone — a song ignores whatever the sender asked for.
    for (const kind of ['audio', 'youtube'] as const) {
      const music = resolveLayout(kind, channel, false, { position: 'top-left', size: 100 });
      expect(music.position).toBe(anchors.musicPosition);
      expect(music.size).toBe(anchors.musicSize);
      expect(music.viewerLayout).toBeUndefined();
    }
  });

  it('re-homes a chosen layout once the channel withdraws the permission', () => {
    // The toggle is read at play time, so switching it off also applies to the waiting queue.
    const channel = { ...anchors, allowViewerPosition: false, youtubeAsMusic: true };
    const layout = resolveLayout('image', channel, false, { position: 'top-left', size: 100 });
    expect(layout.position).toBe(anchors.overlayPosition);
    expect(layout.size).toBe(anchors.overlaySize);
    expect(layout.viewerLayout).toBeUndefined();
  });

  it('keeps the music size but borrows the media corner when anchors are shared', () => {
    const layout = resolveLayout('audio', {
      ...anchors,
      youtubeAsMusic: true,
      musicSeparate: false,
    });
    expect(layout.size).toBe(anchors.musicSize);
    expect(layout.position).toBe(anchors.overlayPosition);
    expect(layout.margin).toBe(anchors.overlayMargin);
  });
});
