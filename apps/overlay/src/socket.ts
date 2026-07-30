import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_BLIND_RELOAD_AFTER_MS,
  SOCKET_OPTIONS,
  SOCKET_RELOAD_AFTER_MS,
  SOCKET_STALL_MS,
  type OverlayDiag,
  type OverlayKind,
  type OverlayToServerEvents,
  type ServerToOverlayEvents,
} from '@tmw/shared';

export type OverlaySocket = Socket<ServerToOverlayEvents, OverlayToServerEvents>;

/** Build stamp injected by vite.config — travels in the handshake so the admin panel can spot
 *  sources still running an old bundle. */
declare const __OVERLAY_BUILD__: string;

/** How often the keepalive checks the clocks below. */
const TICK_MS = 5_000;

/**
 * Grace before the dot appears. Short drops are constant on the links our streamers have, and the
 * page recovers from them by itself — flagging those would train everyone to ignore the dot.
 */
const DOT_AFTER_MS = 10_000;

/** How long the "we're back" blink stays up. */
const DOT_BACK_MS = 3_000;

/** Gap between runs of the recovery ladder once we are past the offline threshold. */
const RECOVERY_GAP_MS = 30_000;

/**
 * Attempts failing back-to-back = a handshake that never lands (a filtered domain looks exactly like
 * this). Escalate on the count instead of waiting out the clock, which costs the streamer the outage.
 */
const FAILED_ATTEMPTS_ESCALATE = 6;

/** Per-candidate probe budget: a throttled link answers late, a filtered one never answers at all. */
const PROBE_TIMEOUT_MS = 5_000;

/** Why the current page exists, when it is our own reload. sessionStorage survives it; localStorage
 *  would also survive the streamer restarting OBS, and then the report would be a lie. */
const RELOAD_MARK = 'tossit:overlayReloadedBy';

/**
 * Where this overlay talks to. Normally wherever it was served from, but ?server= points it
 * elsewhere: if a streamer's ISP blocks our domain the page cannot load at all, and the only way
 * out is loading the overlay from a reachable mirror. Media URLs follow the same base.
 */
export function overlayServerUrl(): string {
  const override = new URLSearchParams(window.location.search).get('server');
  if (override && /^https?:\/\//i.test(override)) return override.replace(/\/$/, '');
  return import.meta.env.DEV ? 'http://127.0.0.1:3000' : window.location.origin;
}

/**
 * Hosts to fall back to when our own origin stops answering. Empty unless VITE_OVERLAY_MIRRORS is
 * set at build time (comma-separated origins) — for streamers whose ISP filters the main domain.
 */
function mirrorUrls(): string[] {
  const raw = (import.meta.env.VITE_OVERLAY_MIRRORS as string | undefined) ?? '';
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter((s) => /^https?:\/\//i.test(s));
}

/** Does this host answer right now? Never throws — a failed probe is just a `false`. */
async function reachable(base: string): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/ping?_=${Date.now()}`, {
      cache: 'no-store',
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Reload the way a streamer does it by hand — OBS's "refresh cache", which is what revives ~9 of 10
 * dead sources. location.reload() only revalidates and can hand back the very document that wedged,
 * so the cache-buster is the point. `origin` is passed only to move the page to a MIRROR; without it
 * the page reloads from wherever it came, which in dev is Vite rather than the server.
 */
function hardReload(why: string, origin?: string): void {
  const url = new URL(window.location.href);
  if (origin) {
    const target = new URL(origin);
    url.protocol = target.protocol;
    url.host = target.host;
  }
  url.searchParams.set('_r', String(Date.now()));
  try {
    sessionStorage.setItem(RELOAD_MARK, why);
  } catch {
    // Storage disabled: we lose the breadcrumb in the logs, not the reload.
  }
  window.location.replace(url.toString());
}

function takeReloadMark(): string | undefined {
  try {
    const mark = sessionStorage.getItem(RELOAD_MARK);
    if (mark) sessionStorage.removeItem(RELOAD_MARK);
    return mark ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The overlay's connection to the server, with the recovery an OBS browser source cannot ask for
 * itself: nobody is watching this page, so anything it fails to fix stays broken until the streamer
 * happens to notice a dead overlay mid-stream.
 *
 * Four ladders, cheapest first: socket.io's own retries, a forced re-dial when the link went away
 * without closing (see SOCKET_STALL_MS), a reload aimed at whichever host still answers, and finally
 * a blind reload — because a page that has been retrying for minutes is not recovering.
 */
export function connectOverlay(serverUrl: string, token: string, kind: OverlayKind): OverlaySocket {
  const socket: OverlaySocket = io(serverUrl, {
    ...SOCKET_OPTIONS,
    query: { role: 'overlay', token, kind, v: __OVERLAY_BUILD__ },
  });

  let lastPacketAt = Date.now();
  /** Previous keepalive tick — a late one means OUR timer was throttled, not that the link is quiet. */
  let lastTickAt = Date.now();
  /** Consecutive silent windows. One alone is too often a delayed ping to re-dial on. */
  let stallStrikes = 0;
  /** Last time the recovery ladder ran, so it doesn't probe on every tick. */
  let lastRecoveryAt = 0;
  let offlineSince: number | null = null;
  /** Failed connection attempts since the last successful connect. */
  let failedAttempts = 0;
  /** Re-dials this page made on a nominally-connected socket (stall detector), for the diag report. */
  let stalls = 0;
  let lastReason: string | null = null;
  /** Read at start-up, so it can only describe a PREVIOUS page: the page that calls hardReload keeps
   *  running until the navigation lands, and would otherwise claim its own mark on a late connect. */
  let reloadedBy = takeReloadMark();
  const candidates = [serverUrl, ...mirrorUrls().filter((m) => m !== serverUrl)];
  const seen = (): void => {
    lastPacketAt = Date.now();
  };
  const dot = mountConnectionDot();

  /** Tell the server what this page went through — the drop reason it logs is only its own half. */
  const report = (diag: OverlayDiag): void => {
    // Nothing to report on a first clean connect; a reload mark alone is worth a line.
    if (!reloadedBy && !diag.reason && diag.offlineMs === 0) return;
    socket.emit('overlay:diag', { ...diag, reloadedBy });
    reloadedBy = undefined; // it explains this page's birth, not every reconnect it later makes
  };

  socket.on('connect', () => {
    const offlineMs = offlineSince === null ? 0 : Date.now() - offlineSince;
    if (offlineMs > DOT_AFTER_MS) dot('back');
    offlineSince = null;
    seen();
    console.log(`[overlay:${kind}] connected`, socket.recovered ? '(recovered)' : '');
    report({ reason: lastReason ?? '', offlineMs, attempts: failedAttempts, stalls });
    failedAttempts = 0;
    lastReason = null;
  });
  socket.on('disconnect', (reason) => {
    offlineSince ??= Date.now();
    lastReason = reason;
    console.log(`[overlay:${kind}] disconnected:`, reason);
  });
  // A handshake that never lands never fires 'disconnect', so without this the ladder below would
  // only ever see the clock — and a filtered domain fails exactly here.
  socket.on('connect_error', (err) => {
    offlineSince ??= Date.now();
    failedAttempts += 1;
    lastReason ??= `connect_error:${err.message}`;
  });
  // Both sources answer this: it is the dashboard's remote "refresh browser source".
  socket.on('overlay:reload', () => window.location.reload());
  socket.onAny(seen);
  // The server's heartbeat, not an app event: on an idle channel it is the only proof of life.
  socket.io.on('ping', seen);

  window.setInterval(() => {
    const now = Date.now();
    const sinceTick = now - lastTickAt;
    lastTickAt = now;
    // A browser source on an inactive OBS scene is a hidden page, and Chromium throttles its timers
    // to about once a minute. A late tick therefore measures our own freeze — resync, judge nothing.
    if (sinceTick > TICK_MS * 3) {
      lastPacketAt = now;
      stallStrikes = 0;
      return;
    }
    if (socket.connected) {
      if (now - lastPacketAt > SOCKET_STALL_MS) {
        stallStrikes += 1;
        if (stallStrikes >= 2) {
          // Half-open socket (DPI reset, NAT timeout): only a re-dial finds out. Close the ENGINE and
          // let socket.io retry — socket.disconnect() sends a clean DISCONNECT, and the server then
          // drops the recoverable session along with the events we missed.
          console.warn(`[overlay:${kind}] connection stalled — reconnecting`);
          stallStrikes = 0;
          stalls += 1;
          offlineSince = now;
          socket.io.engine.close();
        }
      } else {
        stallStrikes = 0;
      }
      return;
    }
    offlineSince ??= now;
    const offlineFor = now - offlineSince;
    if (offlineFor > DOT_AFTER_MS) dot('down');
    // The server turned us away (a rotated or revoked overlay token is the only way this happens):
    // it is not coming back on a reload, and reloading anyway would loop the source forever.
    if (lastReason === 'io server disconnect') return;
    if (
      (offlineFor > SOCKET_RELOAD_AFTER_MS || failedAttempts >= FAILED_ATTEMPTS_ESCALATE) &&
      now - lastRecoveryAt > RECOVERY_GAP_MS
    ) {
      lastRecoveryAt = now;
      void recover(candidates, serverUrl, kind, offlineFor);
    }
  }, TICK_MS);

  // Don't sit out the backoff when the OS already knows the link is back.
  window.addEventListener('online', () => {
    if (!socket.connected) socket.connect();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !socket.connected) socket.connect();
  });

  return socket;
}

/**
 * Reload, preferring a host that answers right now. Blind reload is the last rung and deliberate: a
 * source that stays dead until the streamer notices is worse than one showing an error page, which
 * OBS itself refreshes away on the next scene activation.
 */
async function recover(
  candidates: string[],
  own: string,
  kind: OverlayKind,
  offlineFor: number,
): Promise<void> {
  const secs = Math.round(offlineFor / 1000);
  for (const base of candidates) {
    if (await reachable(base)) {
      console.warn(`[overlay:${kind}] offline ${secs}s but ${base} answers — reloading`);
      hardReload(`probe:${secs}s`, base === own ? undefined : base);
      return;
    }
  }
  // navigator.onLine is a weak signal, but it separates the two cases that matter here: a link that
  // is down (a blind reload lands on an error page) from one that is up while our host is filtered.
  if (offlineFor > SOCKET_BLIND_RELOAD_AFTER_MS && navigator.onLine) {
    console.warn(`[overlay:${kind}] offline ${secs}s, nothing answers — reloading blind`);
    hardReload(`blind:${secs}s`);
  }
}

/**
 * The on-stream half of the outage signal (see .conn-dot). Viewers see it too, which is why it is a
 * dot and not a message — and why ?dot=off exists for a streamer who would rather have nothing on
 * screen and watch the dashboard instead.
 */
function mountConnectionDot(): (state: 'down' | 'back') => void {
  if (new URLSearchParams(window.location.search).get('dot') === 'off') return () => {};
  const el = document.createElement('div');
  el.className = 'conn-dot';
  document.body.appendChild(el);
  let backTimer: number | undefined;
  return (state) => {
    window.clearTimeout(backTimer);
    if (state === 'down') {
      el.classList.add('is-down');
      el.classList.remove('is-back');
      return;
    }
    el.classList.remove('is-down');
    el.classList.add('is-back');
    backTimer = window.setTimeout(() => el.classList.remove('is-back'), DOT_BACK_MS);
  };
}
