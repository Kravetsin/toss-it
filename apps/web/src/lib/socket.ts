import { io, type Socket } from 'socket.io-client';

/** Единственная точка создания socket.io-соединения в приложении. */
export function connectSocket(query: Record<string, string>): Socket {
  return io({ query });
}
