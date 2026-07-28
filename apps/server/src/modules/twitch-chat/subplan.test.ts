import { describe, expect, it } from 'vitest';
import { planSubs, type PlanChannel } from './subplan';

/**
 * A Twitch session holds 300 subscriptions, so what this plan leaves out is the whole point.
 * The grace period is the load-bearing part: OBS scene switches drop the overlay for seconds.
 */
const GRACE = 10 * 60_000;
const CHANNELS: PlanChannel[] = [
  { channelId: 'a', broadcasterId: '100', chatOverlay: true },
  { channelId: 'b', broadcasterId: '200', chatOverlay: false },
];

function plan(live: string[], lastLiveAt: Map<string, number>, now: number) {
  return planSubs(CHANNELS, {
    now,
    live: (channelId) => live.includes(channelId),
    lastLiveAt,
    graceMs: GRACE,
  });
}

describe('planSubs', () => {
  it('subscribes only live channels, and only the chat overlay pays for the extras', () => {
    const got = plan(['a', 'b'], new Map(), 1_000);
    expect(got).toEqual(
      new Map([
        ['100', 'full'],
        ['200', 'core'],
      ]),
    );
  });

  it('leaves out a channel that has never been seen live', () => {
    expect(plan([], new Map(), 1_000).size).toBe(0);
  });

  it('holds a channel through a scene switch, then drops it once the grace expires', () => {
    const lastLiveAt = new Map<string, number>();
    plan(['a'], lastLiveAt, 1_000);
    expect(plan([], lastLiveAt, 1_000 + GRACE).has('100')).toBe(true);
    expect(plan([], lastLiveAt, 1_000 + GRACE + 1).has('100')).toBe(false);
  });

  it('forgets stale channels instead of remembering every channel ever live', () => {
    const lastLiveAt = new Map<string, number>();
    plan(['a'], lastLiveAt, 1_000);
    plan([], lastLiveAt, 1_000 + GRACE + 1);
    expect(lastLiveAt.size).toBe(0);
  });
});
