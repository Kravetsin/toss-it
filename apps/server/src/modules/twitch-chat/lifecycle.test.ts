import type { FastifyBaseLogger } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventSubClient } from './eventsub';

/**
 * Socket lifecycle, not protocol parsing. Twitch closes a session that creates no subscription
 * within 10 seconds (close 4003), so an idle client must hold no socket at all — otherwise a night
 * with nobody streaming becomes an endless connect/close loop.
 */
class FakeSocket {
  closed = false;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    sockets.push(this);
  }
  close(): void {
    this.closed = true;
    this.onclose?.();
  }
}

let sockets: FakeSocket[] = [];
let realWebSocket: typeof globalThis.WebSocket;

let logged: string[] = [];
const log = {
  warn() {},
  error() {},
  info(_fields: unknown, msg: string) {
    logged.push(msg);
  },
} as unknown as FastifyBaseLogger;

function makeClient(): EventSubClient {
  return new EventSubClient({
    botUserId: 'bot',
    getAccessToken: async () => null,
    onChatMessage() {},
    onChatNotice() {},
    onChatDelete() {},
    onChatClearUser() {},
    onChatClear() {},
    log,
  });
}

beforeEach(() => {
  sockets = [];
  logged = [];
  realWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket as unknown as typeof globalThis.WebSocket;
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.WebSocket = realWebSocket;
  vi.useRealTimers();
});

describe('EventSubClient connection lifecycle', () => {
  it('opens no socket while no channel is live', () => {
    const client = makeClient();
    client.start();
    vi.advanceTimersByTime(5 * 60_000); // several watchdog rounds
    expect(sockets).toHaveLength(0);
    client.stop();
  });

  it('opens one when a channel goes live, and reuses it for the next', () => {
    const client = makeClient();
    client.start();
    client.setBroadcasters(new Map([['100', 'full']]));
    expect(sockets).toHaveLength(1);
    client.setBroadcasters(
      new Map([
        ['100', 'full'],
        ['200', 'core'],
      ]),
    );
    expect(sockets).toHaveLength(1);
    client.stop();
  });

  it('closes the socket when the last channel goes offline, without reconnecting', () => {
    const client = makeClient();
    client.start();
    client.setBroadcasters(new Map([['100', 'full']]));
    client.setBroadcasters(new Map());
    expect(sockets[0]?.closed).toBe(true);
    // The close must not look like a failure: no reconnect timer, no watchdog revival.
    vi.advanceTimersByTime(5 * 60_000);
    expect(sockets).toHaveLength(1);
    client.stop();
  });

  it('logs the close once, not on every idle reconcile', () => {
    const client = makeClient();
    client.start();
    client.setBroadcasters(new Map([['100', 'core']]));
    for (let i = 0; i < 3; i += 1) client.setBroadcasters(new Map());
    expect(logged.filter((m) => m === 'twitch-chat: socket closed')).toHaveLength(1);
    client.stop();
  });

  it('opens a fresh socket when a channel comes back', () => {
    const client = makeClient();
    client.start();
    client.setBroadcasters(new Map([['100', 'core']]));
    client.setBroadcasters(new Map());
    client.setBroadcasters(new Map([['100', 'core']]));
    expect(sockets).toHaveLength(2);
    expect(sockets[1]?.closed).toBe(false);
    client.stop();
  });
});
