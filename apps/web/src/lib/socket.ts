import { io, type Socket } from 'socket.io-client';
import { isMockOn } from './devMock';

/** Заглушка сокета для dev-мока (без живых обновлений, но без реконнект-спама). */
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

/** Единственная точка создания socket.io-соединения в приложении. */
export function connectSocket(query: Record<string, string>): Socket {
  if (isMockOn()) return stubSocket();
  return io({ query });
}
