import { io, type Socket } from 'socket.io-client';
import { SOCKET_OPTIONS } from '@tmw/shared';
import { isMockOn } from './devMock';

/** Stub socket for dev-mock: no live updates but no reconnect spam. */
function stubSocket(): Socket {
  const noop = function (this: unknown) {
    return this;
  };
  return {
    on: noop,
    off: noop,
    emit: noop,
    connect: noop,
    disconnect: noop,
    close: () => {},
  } as unknown as Socket;
}

// Sockets that should come back when the link does. One window listener for all of them: components
// mount and unmount, and a per-socket listener would outlive its socket.
const live = new Set<Socket>();
window.addEventListener('online', () => {
  for (const s of live) {
    // A socket closed for good must never be resurrected — only a dropped one reconnects.
    if (!s.active) live.delete(s);
    else if (!s.connected) s.connect();
  }
});

/** Singleton entry point for socket.io connection creation. */
export function connectSocket(query: Record<string, string>): Socket {
  if (isMockOn()) return stubSocket();
  const socket = io({ ...SOCKET_OPTIONS, query });
  // Don't sit out the backoff when the OS already knows the link is back.
  live.add(socket);
  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') live.delete(socket); // our own close(), not a drop
  });
  return socket;
}
