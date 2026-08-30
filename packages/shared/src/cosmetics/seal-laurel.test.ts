import { describe, expect, it } from 'vitest';
import { sealLaurelSprig, sealLaurel, sealLaurelColor } from './effects/seal-laurel';

/**
 * The laurels. The claim is a wave of light CLIMBING the branches and a star that is the wave
 * arriving at the top — both live in generated per-station delays, which is exactly the geometry
 * that goes quietly wrong: shuffle the delays and the piece still renders, it just twinkles
 * instead of climbing.
 */
describe('the laurel seal', () => {
  /** Mirrored from the module: stations per branch, wave step, cycle. */
  const N = 9;
  const STEP = 0.12;
  const CYCLE = 3.6;

  const delays = (svg: string) =>
    [...svg.matchAll(/animation-delay:([\d.]+)s/g)].map((m) => Number(m[1]));

  it('lights each station as one segment, in climbing order', () => {
    const seen = new Map<number, number>();
    for (const d of delays(sealLaurel.svg!)) seen.set(d, (seen.get(d) ?? 0) + 1);
    // One delay per station — and every station's four leaves (two rows × two sides) share it, or
    // the wave reads as glitter rather than as light moving up the wreath.
    expect(seen.size).toBe(N);
    for (const [d, count] of seen) {
      expect(count).toBe(4);
      expect(Math.round(d / STEP) * STEP).toBeCloseTo(d);
    }
  });

  it('does not light the star before the wave has reached the top pair', () => {
    const full = sealLaurel.css!.match(/([\d.]+)% \{\s*transform: scale\(1\.15\);\s*opacity: 1/);
    expect(full).toBeTruthy();
    const starAt = (Number(full![1]) / 100) * CYCLE;
    const lastStation = Math.max(...delays(sealLaurel.svg!));
    expect(starAt).toBeGreaterThanOrEqual(lastStation);
  });

  // The tier is what the wave arrives at, not how bright the body is: same wreath on both rungs,
  // a star waiting at the top of the upper one only.
  it('keeps one body across the rungs and reserves the star for the upper', () => {
    const leaves = (svg: string) => (svg.match(/class="lr-l/g) ?? []).length;
    expect(leaves(sealLaurelSprig.svg!)).toBe(N * 2 * 2);
    expect(leaves(sealLaurel.svg!)).toBe(leaves(sealLaurelSprig.svg!));
    const stars = (svg: string) => (svg.match(/lr-star/g) ?? []).length;
    expect(stars(sealLaurelSprig.svg!)).toBe(0);
    expect(stars(sealLaurel.svg!)).toBeGreaterThan(0);
    // Hotspots survive the tint on both rungs: white leaves plus the white berry.
    const whites = (svg: string) => (svg.match(/lr-w/g) ?? []).length;
    expect(whites(sealLaurelSprig.svg!)).toBe(7);
    expect(whites(sealLaurel.svg!)).toBe(7);
  });

  it('never lets a rung un-earn itself', () => {
    expect(sealLaurelSprig.earn!.metric).toBe('rouletteWins');
    // Every rung above the last, and the colour above them all — the ladder is read top-down in
    // the shop, and a cheaper upper rung would hand the tier out before the thing it upgrades.
    expect(sealLaurelSprig.earn!.count).toBeLessThan(sealLaurel.earn!.count);
    expect(sealLaurel.earn!.count).toBeLessThan(sealLaurelColor.earn!.count);
    expect(sealLaurelColor.upgrade).toBe(true);
    // Earned, never sold: the metric IS the price.
    for (const rung of [sealLaurelSprig, sealLaurel, sealLaurelColor])
      expect(rung.costDust).toBe(0);
  });
});
