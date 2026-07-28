/**
 * Anything older than this was not "redeemed while we were down" by any reading — the stream it was
 * meant for is over. It stays pending for the streamer to resolve by hand, which is a far better
 * outcome than a day-old request appearing on air as if it had just arrived.
 */
export const SWEEP_MAX_AGE_MS = 6 * 60 * 60_000;
/** A sweep that wants to put more than this on screen at once is a bug, not a backlog. */
export const SWEEP_MAX_ITEMS = 5;

export type SweepVerdict = 'take' | 'stale' | 'capped';

/**
 * May the startup sweep put this redemption on screen? Bounded on purpose: the sweep resubmits from
 * Twitch's own unfulfilled list, so any bug that stops us settling redemptions turns every restart
 * into a fresh copy of the same request. The bounds cap what one such bug can spill on stream.
 */
export function sweepVerdict(opts: {
  /** Does this reward kind put something in the queue? Stardust is credited and fulfilled on the
   *  spot — it cannot pile up, and skipping it would quietly keep points already spent. */
  queues: boolean;
  /** Twitch's `redeemed_at`; missing or unparseable counts as fresh — never drop a real request
   *  over a timestamp detail. */
  redeemedAt: string | undefined;
  takenSoFar: number;
  now: number;
}): SweepVerdict {
  if (!opts.queues) return 'take';
  const at = opts.redeemedAt ? Date.parse(opts.redeemedAt) : Number.NaN;
  if (Number.isFinite(at) && opts.now - at > SWEEP_MAX_AGE_MS) return 'stale';
  if (opts.takenSoFar >= SWEEP_MAX_ITEMS) return 'capped';
  return 'take';
}
