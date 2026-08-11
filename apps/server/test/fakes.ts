import crypto from 'node:crypto';
import { db } from '../src/db/index';
import { channels, submissions, users, type SubmissionRow } from '../src/db/schema';
import { overlayKindRoomOf, type RealtimeServer } from '../src/playback';

/** One emit the code under test made, in the order it made them. */
export interface SentEvent {
  room: string;
  event: string;
  args: unknown[];
}

export interface FakeIo {
  io: RealtimeServer;
  sent: SentEvent[];
  /** Pretend an OBS source of this kind is connected — presence() reads the adapter's rooms. */
  connectOverlay(channelId: string, kind?: 'media' | 'chat'): void;
  disconnectOverlays(channelId: string): void;
  /** Every event of this name, newest last. */
  eventsOf(name: string): SentEvent[];
}

/**
 * A socket.io stand-in: records what was broadcast and answers the two questions the playback code
 * actually asks of it — "emit to this room" and "who is in that room". Small on purpose; mocking
 * the real Server would test socket.io rather than us.
 */
export function fakeIo(): FakeIo {
  const sent: SentEvent[] = [];
  const rooms = new Map<string, Set<string>>();
  const io = {
    to(room: string) {
      return {
        emit(event: string, ...args: unknown[]) {
          sent.push({ room, event, args });
        },
      };
    },
    sockets: { adapter: { rooms } },
  } as unknown as RealtimeServer;

  return {
    io,
    sent,
    connectOverlay(channelId, kind = 'media') {
      rooms.set(overlayKindRoomOf(channelId, kind), new Set([crypto.randomUUID()]));
    },
    disconnectOverlays(channelId) {
      rooms.delete(overlayKindRoomOf(channelId, 'media'));
      rooms.delete(overlayKindRoomOf(channelId, 'chat'));
    },
    eventsOf(name) {
      return sent.filter((e) => e.event === name);
    },
  };
}

/**
 * A channel row with a fresh id, so test files can share one database file without colliding.
 * `patch` overrides any column — routing switches are what tests usually want.
 */
export async function makeChannel(
  patch: Partial<typeof channels.$inferInsert> = {},
): Promise<string> {
  const id = `ch_${crypto.randomUUID()}`;
  const userId = `u_${crypto.randomUUID()}`;
  await db.insert(users).values({
    id: userId,
    login: userId,
    displayName: userId,
    avatarUrl: null,
    createdAt: new Date(),
  });
  await db.insert(channels).values({
    id,
    ownerUserId: userId,
    overlayToken: crypto.randomUUID(),
    createdAt: new Date(),
    ...patch,
  });
  return id;
}

/** An approved submission ready to be queued. Defaults to a plain image (the media slot). */
export async function makeSubmission(
  channelId: string,
  patch: Partial<SubmissionRow> = {},
): Promise<SubmissionRow> {
  const now = new Date();
  const row: SubmissionRow = {
    id: crypto.randomUUID(),
    channelId,
    senderUserId: null,
    senderName: 'tester',
    senderPlatform: 'twitch',
    senderPlatformUserId: `tw_${crypto.randomUUID()}`,
    originalName: 'frame.png',
    filePath: `${channelId}/frame.png`,
    text: null,
    mime: 'image/png',
    kind: 'image',
    durationMs: 8_000,
    status: 'approved',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    youtubeId: null,
    youtubeStart: 0,
    giphyId: null,
    ttsVoice: null,
    overlayPosition: null,
    overlaySize: null,
    overlayMargin: null,
    isSelfSend: false,
    ...patch,
  };
  await db.insert(submissions).values(row);
  return row;
}

/** A YouTube submission — the music slot's usual occupant. */
export function youtubePatch(patch: Partial<SubmissionRow> = {}): Partial<SubmissionRow> {
  return {
    kind: 'youtube',
    mime: 'video/youtube',
    filePath: null,
    youtubeId: 'dQw4w9WgXcQ',
    durationMs: 0,
    ...patch,
  };
}
