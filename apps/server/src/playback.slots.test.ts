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
