import { describe, expect, it } from 'vitest';
import { MEDIA_UPSCALE_MAX, OVERLAY_STAGE, renderedMediaPct } from './index';

/**
 * This mirrors a CSS rule in the overlay (.player.has-media img[data-nat]) that the sender's
 * preview cannot share. If the two drift, the preview promises a size the stream won't deliver —
 * which is the whole complaint this was written to fix.
 */
describe('renderedMediaPct', () => {
  const pct = (w: number, h: number, size: number) =>
    renderedMediaPct({ width: w, height: h }, size);

  it('caps the upscale of small media rather than filling the chosen size', () => {
    // A 400x250 screenshot asked to be full screen: ×2 is as far as it goes.
    const { width } = pct(400, 250, 100);
    expect(width).toBeCloseTo(((400 * MEDIA_UPSCALE_MAX) / OVERLAY_STAGE.width) * 100, 5);
  });

  it('fills the chosen size when the media has pixels to spare', () => {
    // 1920x1080 at 50%: bounded by the width cap (minus the card's inset), not by its own pixels.
    const { width } = pct(1920, 1080, 50);
    expect(width).toBeGreaterThan(45);
    expect(width).toBeLessThanOrEqual(50);
  });

  it('lets the taller axis decide, so nothing overflows the stage', () => {
    // Portrait media: height runs out first, so width stays well under the chosen size.
    const { height, width } = pct(600, 1600, 80);
    expect(height).toBeLessThanOrEqual(80);
    expect(width).toBeLessThan(80);
  });

  it('keeps the aspect ratio whatever the constraint', () => {
    for (const size of [10, 45, 80, 100]) {
      const r = pct(640, 400, size);
      const px = {
        w: (r.width / 100) * OVERLAY_STAGE.width,
        h: (r.height / 100) * OVERLAY_STAGE.height,
      };
      expect(px.w / px.h).toBeCloseTo(640 / 400, 5);
    }
  });
});
