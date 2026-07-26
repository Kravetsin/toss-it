import { io, type Socket } from 'socket.io-client';
import {
  SOCKET_OPTIONS,
  SOCKET_RELOAD_AFTER_MS,
  SOCKET_STALL_MS,
  type OverlayToServerEvents,
  type ServerToOverlayEvents,
} from '@tmw/shared';

export type OverlaySocket = Socket<ServerToOverlayEvents, OverlayToServerEvents>;

/** How often the keepalive checks the clocks below. */
const TICK_MS = 5_000;

/**
 * The overlay's connection to the server, with the recovery an OBS browser source cannot ask for
 * itself: nobody is watching this page, so anything it fails to fix stays broken until the streamer
 * happens to notice a dead overlay mid-stream.
 *
 * Three ladders, cheapest first: socket.io's own retries, a forced re-dial when the link went away
 * without closing (see SOCKET_STALL_MS), and finally a page reload for the states no socket can
 * recover from — a wedged browser source, a stale DNS answer.
 */
export function connectOverlay(serverUrl: string, token: string): OverlaySocket {
  const socket: OverlaySocket = io(serverUrl, {
    ...SOCKET_OPTIONS,
    query: { role: 'overlay', token },
  });

  let lastPacketAt = Date.now();
  let offlineSince: number | null = null;
  const seen = (): void => {
    lastPacketAt = Date.now();
  };

  socket.on('connect', () => {
    offlineSince = null;
    seen();
    console.log('[overlay] connected', socket.recovered ? '(recovered)' : '');
  });
  socket.on('disconnect', (reason) => {
    offlineSince ??= Date.now();
    console.log('[overlay] disconnected:', reason);
  });
  socket.onAny(seen);
  // The server's heartbeat, not an app event: on an idle channel it is the only proof of life.
  socket.io.on('ping', seen);

  window.setInterval(() => {
    const now = Date.now();
    if (socket.connected) {
      // Nothing at all from the server, yet we still believe we are connected — a half-open socket
      // (DPI reset, NAT timeout). Only a re-dial finds out; waiting on it never ends.
      if (now - lastPacketAt > SOCKET_STALL_MS) {
        console.warn('[overlay] connection stalled — reconnecting');
        offlineSince = now;
        socket.disconnect();
        socket.connect();
      }
      return;
    }
    offlineSince ??= now;
    if (now - offlineSince > SOCKET_RELOAD_AFTER_MS) {
      console.warn('[overlay] offline too long — reloading');
      window.location.reload();
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
