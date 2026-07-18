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
    parsed: ParsedYoutube;
    /** Caption (leftover text) or the video title. */
    title: string | undefined;
    autoApproved: boolean;
  },
): Promise<SubmissionRow> {
  const now = new Date();
  const row: SubmissionRow = {
    id: crypto.randomUUID(),
    channelId: input.channelId,
    senderUserId: input.senderUserId,
    senderName: input.senderName,
    originalName: '', // no source filename for a link
    filePath: null,
    text: input.title ?? null,
    mime: input.parsed.isMusic ? 'audio/youtube' : 'video/youtube',
    kind: 'youtube',
    // Length is unknown ahead of play (overlay reports the real value); it plays to the end.
    durationMs: 0,
    status: input.autoApproved ? 'approved' : 'pending',
    createdAt: now,
    updatedAt: now,
    youtubeId: input.parsed.videoId,
    youtubeStart: input.parsed.startSeconds,
    giphyId: null,
    ttsVoice: null,
    isSelfSend: false,
  };
  await db.insert(submissions).values(row);
  if (row.status === 'approved') {
    deps.playback.enqueue(row);
  } else {
    deps.io.to(dashboardRoomOf(input.channelId)).emit('moderation:new', await toLiveSummary(row));
  }
  return row;
}
