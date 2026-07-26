import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_OPTIONS,
  SOCKET_RELOAD_AFTER_MS,
  SOCKET_STALL_MS,
  type OverlayKind,
  type OverlayToServerEvents,
  type ServerToOverlayEvents,
} from '@tmw/shared';

export type OverlaySocket = Socket<ServerToOverlayEvents, OverlayToServerEvents>;

/** How often the keepalive checks the clocks below. */
const TICK_MS = 5_000;

/**
 * Grace before the dot appears. Short drops are constant on the links our streamers have, and the
 * page recovers from them by itself — flagging those would train everyone to ignore the dot.
 */
const DOT_AFTER_MS = 10_000;

/** How long the "we're back" blink stays up. */
const DOT_BACK_MS = 3_000;

/** Gap between reload probes once we are past the offline threshold. */
const RELOAD_PROBE_MS = 30_000;

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
 * The overlay's connection to the server, with the recovery an OBS browser source cannot ask for
 * itself: nobody is watching this page, so anything it fails to fix stays broken until the streamer
 * happens to notice a dead overlay mid-stream.
 *
 * Three ladders, cheapest first: socket.io's own retries, a forced re-dial when the link went away
 * without closing (see SOCKET_STALL_MS), and finally a page reload for the states no socket can
 * recover from — a wedged browser source, a stale DNS answer.
 */
export function connectOverlay(serverUrl: string, token: string, kind: OverlayKind): OverlaySocket {
  const socket: OverlaySocket = io(serverUrl, {
    ...SOCKET_OPTIONS,
    query: { role: 'overlay', token, kind },
  });

  let lastPacketAt = Date.now();
  /** Last time we asked the server whether a reload would land anywhere (see the tick below). */
  let lastReloadProbeAt = 0;
  let offlineSince: number | null = null;
  const seen = (): void => {
    lastPacketAt = Date.now();
  };
  const dot = mountConnectionDot();

  socket.on('connect', () => {
    if (offlineSince !== null && Date.now() - offlineSince > DOT_AFTER_MS) dot('back');
    offlineSince = null;
    seen();
    console.log(`[overlay:${kind}] connected`, socket.recovered ? '(recovered)' : '');
  });
  socket.on('disconnect', (reason) => {
    offlineSince ??= Date.now();
    console.log(`[overlay:${kind}] disconnected:`, reason);
  });
  // Both sources answer this: it is the dashboard's remote "refresh browser source".
  socket.on('overlay:reload', () => window.location.reload());
  socket.onAny(seen);
  // The server's heartbeat, not an app event: on an idle channel it is the only proof of life.
  socket.io.on('ping', seen);

  window.setInterval(() => {
    const now = Date.now();
    if (socket.connected) {
      // Nothing at all from the server, yet we still believe we are connected — a half-open socket
      // (DPI reset, NAT timeout). Only a re-dial finds out; waiting on it never ends.
      if (now - lastPacketAt > SOCKET_STALL_MS) {
        console.warn(`[overlay:${kind}] connection stalled — reconnecting`);
        offlineSince = now;
        socket.disconnect();
        socket.connect();
      }
      return;
    }
    offlineSince ??= now;
    if (now - offlineSince > DOT_AFTER_MS) dot('down');
    if (now - offlineSince > SOCKET_RELOAD_AFTER_MS && now - lastReloadProbeAt > RELOAD_PROBE_MS) {
      lastReloadProbeAt = now;
      // Never reload blind. This page came from the server, so reloading while the server is down
      // swaps a page that keeps retrying for a browser error page that never retries anything —
      // the overlay would stay dead until someone refreshed the source by hand. Ask first.
      void fetch(`${serverUrl}/api/ping`, { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) return;
          console.warn(`[overlay:${kind}] offline too long but the server answers — reloading`);
          window.location.reload();
        })
        .catch(() => {
          // Server still unreachable: stay on the page and let socket.io keep trying.
        });
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
