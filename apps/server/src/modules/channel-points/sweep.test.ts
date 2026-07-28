import { describe, expect, it } from 'vitest';
import { SWEEP_MAX_AGE_MS, SWEEP_MAX_ITEMS, sweepVerdict } from './sweep';

/**
 * The bounds exist because of a real incident: redemptions we failed to settle came back from
 * Twitch's backlog on every deploy, and by the third one the queue held five copies of the same
 * song. Each case here is a copy that must not reach the screen.
 */
const NOW = Date.parse('2026-07-28T20:00:00Z');
const ask = (patch: Partial<Parameters<typeof sweepVerdict>[0]> = {}) =>
  sweepVerdict({
    queues: true,
    redeemedAt: new Date(NOW - 60_000).toISOString(),
    takenSoFar: 0,
    now: NOW,
    ...patch,
  });

describe('sweepVerdict', () => {
  it('takes a request redeemed while we were restarting', () => {
    expect(ask()).toBe('take');
  });

  it('leaves one whose stream is long over', () => {
    expect(ask({ redeemedAt: new Date(NOW - SWEEP_MAX_AGE_MS - 1).toISOString() })).toBe('stale');
  });

  it('stops once it has taken enough — a bigger backlog is a bug, not a queue', () => {
    expect(ask({ takenSoFar: SWEEP_MAX_ITEMS - 1 })).toBe('take');
    expect(ask({ takenSoFar: SWEEP_MAX_ITEMS })).toBe('capped');
  });

  it('never drops a request over a missing timestamp', () => {
    expect(ask({ redeemedAt: undefined })).toBe('take');
    expect(ask({ redeemedAt: 'not a date' })).toBe('take');
  });

  // Stardust settles on the spot, so it can neither pile up nor come back — and skipping it would
  // silently keep points the viewer already spent.
  it('lets stardust through both bounds', () => {
    const old = new Date(NOW - SWEEP_MAX_AGE_MS - 1).toISOString();
    expect(ask({ queues: false, redeemedAt: old, takenSoFar: 99 })).toBe('take');
  });
});
