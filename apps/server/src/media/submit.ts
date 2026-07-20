import crypto from 'node:crypto';
import { db } from '../db/index';
import { submissions, type SubmissionRow } from '../db/schema';
import {
  dashboardRoomOf,
  toLiveSummary,
  type PlaybackManager,
  type RealtimeServer,
} from '../playback';
import type { ParsedYoutube } from './youtube';

/**
 * Create a YouTube submission from a non-HTTP source (e.g. a channel-points redemption) and route it
 * exactly like a normal upload: approved → into the playback queue, pending → to the dashboard's
 * moderation feed. `senderUserId` is the viewer's linked Tossit account or null (anonymous).
 */
export async function createYoutubeSubmission(
  deps: { playback: PlaybackManager; io: RealtimeServer },
  input: {
    channelId: string;
    senderUserId: string | null;
    senderName: string;
    /** Sender's platform identity, which a redemption knows even when senderUserId is null. */
    senderPlatform?: string;
    senderPlatformUserId?: string;
    parsed: ParsedYoutube;
    /** Caption (leftover text) or the video title. */
    title: string | undefined;
    /** Real video length (ms) if known from the API — for display; 0 = unknown (shows as ∞). */
    durationMs?: number;
    /** Music vs video (compact player vs full-screen). Defaults to the parsed URL's own signal. */
    isMusic?: boolean;
    autoApproved: boolean;
    /** The broadcaster requested their own video — plays fine, but excluded from stats. */
    isSelfSend?: boolean;
  },
): Promise<SubmissionRow> {
  const now = new Date();
  const row: SubmissionRow = {
    id: crypto.randomUUID(),
    channelId: input.channelId,
    senderUserId: input.senderUserId,
    senderName: input.senderName,
    senderPlatform: input.senderPlatform ?? null,
    senderPlatformUserId: input.senderPlatformUserId ?? null,
    originalName: '', // no source filename for a link
    filePath: null,
    text: input.title ?? null,
    mime: (input.isMusic ?? input.parsed.isMusic) ? 'audio/youtube' : 'video/youtube',
    kind: 'youtube',
    // Stored for display (queue/moderation/history/now-playing) so cards show the real length, not
    // ∞. The overlay still gets 0 (see buildPayload) and finishes on the player's 'ended' event —
    // a hard cap on the API length would cut early when buffering/ads push wall-clock past it.
    durationMs: input.durationMs ?? 0,
    status: input.autoApproved ? 'approved' : 'pending',
    createdAt: now,
    updatedAt: now,
    youtubeId: input.parsed.videoId,
    youtubeStart: input.parsed.startSeconds,
    giphyId: null,
    ttsVoice: null,
    isSelfSend: input.isSelfSend ?? false,
  };
  await db.insert(submissions).values(row);
  if (row.status === 'approved') {
    deps.playback.enqueue(row);
  } else {
    deps.io.to(dashboardRoomOf(input.channelId)).emit('moderation:new', await toLiveSummary(row));
  }
  return row;
}
