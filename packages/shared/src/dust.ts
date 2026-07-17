/**
 * Stardust award weights — the whole viewer economy in one place, so the shop's "how to earn" copy
 * (it interpolates these) can't drift from what the server actually pays.
 *
 * Deliberately NOT the same as LEVEL_POINTS, which they otherwise mirror: dust rewards the ATTEMPT
 * (a send counts the moment it arrives, even if it never airs), XP rewards the OUTCOME (only aired
 * sends, which need the streamer's pick). So dust makes the core action worth doing, while XP stays
 * an unfarmable medal.
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
  /** Dust granted for a redemption of `cost` points. */
  dustFor(cost: number): number {
    return Math.max(1, Math.floor(cost / CHANNEL_POINTS.pointsPerDust));
  },
} as const;
