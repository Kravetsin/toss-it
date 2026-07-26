import { describe, expect, it } from 'vitest';
import { CHANNEL_POINTS, DUST_POINTS } from './dust';

/**
 * The payout formulas changed three times in a day (cap, then floor, then a second rate for the
 * streamer), and a wrong number here quietly costs a viewer the points they spent. These are the
 * boundaries each version got wrong at least once.
 */
describe('dustForRequest', () => {
  const viewer = (cost: number) => CHANNEL_POINTS.dustForRequest(cost);
  const owner = (cost: number) => CHANNEL_POINTS.dustForRequest(cost, 'owner');

  it('pays a plain send for a request that cost nothing (!play)', () => {
    expect(viewer(0)).toBe(DUST_POINTS.send);
    expect(owner(0)).toBe(DUST_POINTS.send);
  });

  it('never pays less than a plain send, however cheap the reward', () => {
    // A streamer can price their own reward at 1 point in Twitch; paying 0 for it would make
    // spending points worse than the free !play, which is the trap the floor exists for.
    expect(viewer(1)).toBe(DUST_POINTS.send);
    expect(viewer(CHANNEL_POINTS.minCost)).toBe(DUST_POINTS.send);
  });

  it('scales with the reward cost past the floor', () => {
    expect(viewer(200)).toBe(100);
    expect(viewer(5_000)).toBe(2_500);
    expect(viewer(CHANNEL_POINTS.maxCost)).toBe(5_000);
  });

  it('pays the streamer on a stingier rate — they spend nothing and set the price', () => {
    expect(owner(200)).toBe(DUST_POINTS.send); // still on the floor at the default cost
    expect(owner(5_000)).toBe(500);
    expect(owner(CHANNEL_POINTS.maxCost)).toBe(1_000);
  });

  it('is monotonic and never pays the streamer more than the viewer', () => {
    let prevViewer = 0;
    let prevOwner = 0;
    for (let cost = 0; cost <= CHANNEL_POINTS.maxCost; cost += 50) {
      const v = viewer(cost);
      const o = owner(cost);
      expect(v).toBeGreaterThanOrEqual(prevViewer);
      expect(o).toBeGreaterThanOrEqual(prevOwner);
      expect(o).toBeLessThanOrEqual(v);
      prevViewer = v;
      prevOwner = o;
    }
  });
});

describe('the stardust exchange', () => {
  it('converts points at the published rate, with a floor of one', () => {
    expect(CHANNEL_POINTS.dustFor(200)).toBe(100);
    expect(CHANNEL_POINTS.dustFor(1)).toBe(1);
  });

  it('gives the streamer a cut with no floor — an exchange brings no submission with it', () => {
    expect(CHANNEL_POINTS.ownerDustFor(200)).toBe(20);
    expect(CHANNEL_POINTS.ownerDustFor(5)).toBe(0);
  });

  it('clamps a requested cost into the allowed range', () => {
    expect(CHANNEL_POINTS.clampCost(10)).toBe(CHANNEL_POINTS.minCost);
    expect(CHANNEL_POINTS.clampCost(999_999)).toBe(CHANNEL_POINTS.maxCost);
    expect(CHANNEL_POINTS.clampCost(Number.NaN)).toBe(CHANNEL_POINTS.defaultCost);
  });
});
