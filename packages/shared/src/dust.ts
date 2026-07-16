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
