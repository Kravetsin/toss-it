import { io, type Socket } from 'socket.io-client';
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

/** Singleton entry point for socket.io connection creation. */
export function connectSocket(query: Record<string, string>): Socket {
  if (isMockOn()) return stubSocket();
  return io({ query });
}
