/**
 * Socket.io client tuning shared by every consumer (overlay, chat overlay, web). Most of our
 * streamers are on links that drop several times an hour, so the defaults — which wait 20s before
 * giving up on a connection attempt and back off to 5s between retries — are too patient.
 */
export const SOCKET_OPTIONS = {
  /** Give up on a connection attempt sooner, so the next retry starts sooner. */
  timeout: 10_000,
  reconnectionDelay: 500,
  reconnectionDelayMax: 4_000,
  randomizationFactor: 0.5,
} as const;

/**
 * No packet for this long while nominally connected = the link died without telling us (DPI resets
 * and NAT timeouts leave a half-open socket). Must exceed the server's ping interval + timeout,
 * which is what keeps a genuinely idle connection from being torn down.
 */
export const SOCKET_STALL_MS = 25_000;

/** Offline this long = something the socket layer can no longer fix (a wedged OBS browser source). */
export const SOCKET_RELOAD_AFTER_MS = 180_000;
