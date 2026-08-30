import { describe, expect, it } from 'vitest';
import { sealZeroQuiet, sealZero, sealZeroColor } from './effects/seal-zero';

/**
 * The wheel seal. Its whole claim is that the ball comes to rest IN THE GREEN — the mark has to
 * show the thing the metric counts, and a ball landing anywhere would say "I played" where the
 * counter says "I hit". That lives in generated keyframes, which is exactly the kind of geometry
 * that goes quietly wrong: it was aimed at the wrong pocket twice while the seal was being drawn,
 * and both times it still looked plausible.
 */
describe('the zero seal', () => {
  /** The ring, mirrored from the module. Pocket 0 is the zero. */
  const N = 15;
  const SPAN = 360 / N;
  const GAP = 2.4;
  const POCKET = { in: 6.7, out: 9.5 };
  /** The phase at which the ball is riding the pocket, and the wheel's one turn per cycle. */
  const SEAT = 74;

  /** Keyframe stops of a generated animation, as [percent, number] pairs. */
  const stops = (css: string, name: string, unit: 'deg' | 'px'): [number, number][] => {
    const block = css.slice(css.indexOf(`@keyframes ${name}`));
    const body = block.slice(0, block.indexOf('\n}'));
    const re = new RegExp(`([\\d.]+)% \\{ transform: \\w+\\((-?[\\d.]+)${unit}\\)`, 'g');
    return [...body.matchAll(re)].map((m) => [Number(m[1]), Number(m[2])]);
  };

  it('brings the ball to rest inside the green pocket, and keeps it there', () => {
    const orbit = stops(sealZero.css!, 'seal-zero-orbit', 'deg');
    const seated = orbit.filter(([pct]) => pct >= SEAT);
    expect(seated.length).toBeGreaterThan(2);

    for (const [pct, deg] of seated) {
      // The wheel turns once a cycle, so subtracting its angle reads the ball in ITS frame —
      // which is the only frame in which "pocket 0" means anything.
      const inWheel = (((deg - 3.6 * pct) % 360) + 360) % 360;
      expect(inWheel).toBeGreaterThan(GAP / 2);
      expect(inWheel).toBeLessThan(SPAN - GAP / 2);
    }
  });

  it('drops the ball into the ring rather than onto it', () => {
    const reach = stops(sealZero.css!, 'seal-zero-reach', 'px');
    const seated = reach.filter(([pct]) => pct >= SEAT && pct <= 88);
    expect(seated.length).toBeGreaterThan(0);
    for (const [, r] of seated) {
      expect(r).toBeGreaterThan(POCKET.in);
      expect(r).toBeLessThan(POCKET.out);
    }
  });

  it('runs three whole laps before it drops', () => {
    const orbit = stops(sealZero.css!, 'seal-zero-orbit', 'deg');
    const start = orbit.find(([pct]) => pct === 0)![1];
    const atDrop = orbit.find(([pct]) => pct === 60)![1];
    // Against the wheel, and by a whole number of turns: a partial lap would land the throw on a
    // different pocket every cycle, which is the one thing this mark must not do.
    expect(start - atDrop).toBe(1080);
  });

  // The tier is what the wheel ANSWERS with, not how bright it is: the lower rung lights the
  // pocket the ball is in, the upper one runs that light out through the ring.
  it('answers with one pocket on the lower rung and the whole ring on the upper', () => {
    const fires = (svg: string) => (svg.match(/zr-fire/g) ?? []).length;
    expect(fires(sealZeroQuiet.svg!)).toBe(1);
    expect(fires(sealZero.svg!)).toBe(N);
    // Same body on both, or the lower one reads as a broken copy of the upper.
    const pockets = (svg: string) => (svg.match(/zr-pocket/g) ?? []).length;
    expect(pockets(sealZeroQuiet.svg!)).toBe(pockets(sealZero.svg!));
  });

  it('never lets a rung un-earn itself', () => {
    expect(sealZeroQuiet.earn!.metric).toBe('rouletteGreens');
    // Every rung above the last, and the colour above them all — the ladder is read top-down in
    // the shop, and a cheaper upper rung would hand the tier out before the thing it upgrades.
    expect(sealZeroQuiet.earn!.count).toBeLessThan(sealZero.earn!.count);
    expect(sealZero.earn!.count).toBeLessThan(sealZeroColor.earn!.count);
    expect(sealZeroColor.upgrade).toBe(true);
    // Earned, never sold: the metric IS the price.
    for (const rung of [sealZeroQuiet, sealZero, sealZeroColor]) expect(rung.costDust).toBe(0);
  });
});
