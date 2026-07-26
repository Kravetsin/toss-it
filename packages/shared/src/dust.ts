/**
 * Stardust award weights — the whole viewer economy in one place, so the shop's "how to earn" copy
 * (it interpolates these) can't drift from what the server actually pays.
 *
 * Deliberately NOT the same as LEVEL_POINTS, which they otherwise mirror: dust rewards the ATTEMPT
 * (a send counts the moment it arrives, even if it never airs), XP rewards the OUTCOME (only aired
 * sends, which need the streamer's pick). So dust makes the core action worth doing, while XP stays
 * an unfarmable medal.
 *
 * One exception, and it is not an accident: a YouTube request (channel-points reward or !play) pays
 * only once it airs. There the attempt costs the viewer real channel points that we refund when it
 * doesn't play — paying for the attempt too would turn an unplayable link into free dust.
 *
 * Ordering invariant: lurker < chatter < sender. A send must stay clearly worth more than idling
 * for the same stretch, or the product's central action becomes the least rewarding one.
 */
export const DUST_POINTS = {
  /** One chat message. No cooldown — Twitch's own rate limits are the ceiling. */
  message: 1,
  /** One minute present in a channel's chat while its overlay is live. */
  watchMinute: 1,
  /** One submission received (mirrored to the streamer — their dust tracks real inbox use). */
  send: 50,
} as const;

/**
 * Channel-points → stardust exchange (an app-owned Twitch reward the streamer opts into). Not a cap
 * risk: every dust sink is a permanent, non-transferable unlock, so the ceiling of any dust pile is
 * "own the whole catalog once" — the accepted whale outcome. The streamer sets the reward's point
 * cost; we derive dust from it live, so changing the cost auto-adjusts the payout.
 */
export const CHANNEL_POINTS = {
  /** Channel points per 1 dust. dust = floor(cost / this), min 1. */
  pointsPerDust: 2,
  /** Default point cost when we create the reward (streamer can change it in Twitch). */
  defaultCost: 200,
  /** Slider bounds + snap for the point cost the streamer picks at creation (round numbers only). */
  minCost: 50,
  maxCost: 10_000,
  costStep: 50,
  /** Dust granted for a redemption of `cost` points. */
  dustFor(cost: number): number {
    return Math.max(1, Math.floor(cost / CHANNEL_POINTS.pointsPerDust));
  },
  /**
   * Channel points per 1 dust for the STREAMER's mirrored half of a request. Deliberately stingier
   * than the viewer's rate: the viewer spends points they had to sit through a stream to earn,
   * while the streamer spends nothing and collects on every request the channel receives. They also
   * set the price themselves, so a shared rate would let them pick their own payout.
   */
  ownerPointsPerDust: 10,
  /**
   * Dust for a YouTube request, by who is being paid. Same idea for both: the exchange rate, but
   * never less than a plain send is worth — a request through the reward must not pay less than the
   * free `!play` for the same video, which is exactly what a bare rate would do at low prices.
   *
   * Uncapped on purpose. Twitch pays roughly 2 points per minute watched, so at 2:1 a redemption
   * converts a viewer's watch time one-for-one into `watchMinute` dust — no inflation against the
   * rest of the economy. A cap would instead punish saving up: 5000 points is ~40 hours, and paying
   * a flat 50 for it made one big request far worse value than fifty small ones, which is the spam
   * we least want. What actually bounds this is airtime — a request pays only once it plays.
   */
  dustForRequest(cost: number, side: 'viewer' | 'owner' = 'viewer'): number {
    if (side === 'owner') return Math.max(DUST_POINTS.send, CHANNEL_POINTS.ownerDustFor(cost));
    return Math.max(DUST_POINTS.send, Math.floor(cost / CHANNEL_POINTS.pointsPerDust));
  },
  /**
   * The streamer's cut of a redemption, at their own rate. No floor here, unlike a request: a
   * request is inbox work that a plain send would already pay 50 for, while this is a straight
   * exchange with nothing arriving — the cut is all there is to it.
   */
  ownerDustFor(cost: number): number {
    return Math.floor(cost / CHANNEL_POINTS.ownerPointsPerDust);
  },
  /** Clamp an arbitrary requested cost into the allowed range (NaN → default). */
  clampCost(cost: number): number {
    if (!Number.isFinite(cost)) return CHANNEL_POINTS.defaultCost;
    return Math.min(CHANNEL_POINTS.maxCost, Math.max(CHANNEL_POINTS.minCost, Math.round(cost)));
  },
} as const;
