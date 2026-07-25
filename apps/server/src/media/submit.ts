import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { DUST_POINTS } from '@tmw/shared';
import { db } from '../db/index';
import { channels, linkedIdentities, submissions, type SubmissionRow } from '../db/schema';
import {
  dashboardRoomOf,
  roomOf,
  toLiveSummary,
  type PlaybackManager,
  type RealtimeServer,
} from '../playback';
import { awardDust } from '../modules/twitch-chat/accrual';
import {
  fetchVideoInfo,
  parseYoutube,
  validateYoutube,
  YT_MUSIC_CATEGORY_ID,
  type ParsedYoutube,
} from './youtube';

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
    startedAt: null, // stamped by the playback manager when it actually goes on screen
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

/** A YouTube link that parsed and is embeddable — ready to become a submission. */
export interface ResolvedYoutube {
  parsed: ParsedYoutube;
  meta: { title: string };
}

/**
 * Parse the first YouTube URL in `text` and confirm it is playable (exists + embeddable). Null when
 * there is no link or it is private/deleted/embedding-disabled. Shared by every non-web entry point
 * (channel-points redemptions, the `!play` chat command) so they all judge a link the same way.
 */
export async function resolvePlayableYoutube(text: string): Promise<ResolvedYoutube | null> {
  const parsed = parseYoutube(text);
  if (!parsed) return null;
  const meta = await validateYoutube(parsed.videoId);
  return meta ? { parsed, meta } : null;
}

/**
 * Turn an already-resolved YouTube link into a submission exactly like a channel-points redemption:
 * decide music vs video and auto-approve from the channel's settings, route into the queue or the
 * moderation feed, and award the send dust (mirrored to the owner) unless the broadcaster sent their
 * own. `broadcasterId` is the channel owner's Twitch id — used for the mirror and the self-send test.
 */
export async function submitResolvedYoutube(
  deps: { playback: PlaybackManager; io: RealtimeServer },
  input: {
    channelId: string;
    broadcasterId: string;
    resolved: ResolvedYoutube;
    senderTwitchId: string;
    senderName: string;
  },
): Promise<{ autoApproved: boolean }> {
  const { parsed, meta } = input.resolved;
  const isSelfSend = input.senderTwitchId === input.broadcasterId;
  const channel = await db.select().from(channels).where(eq(channels.id, input.channelId)).get();
  const info = (await fetchVideoInfo([parsed.videoId])).get(parsed.videoId);
  const durationSec = info?.durationSec ?? 0;
  // Music if the link is from music.youtube.com OR the video's YouTube category is Music (10) — so a
  // plain youtube.com music track still renders as the compact player, not full-screen video.
  const isMusic = parsed.isMusic || info?.categoryId === YT_MUSIC_CATEGORY_ID;
  // Auto-approve is split by type (video can take over the whole screen), and only within the
  // duration cap; longer / unknown-length → moderation.
  const capSec = (channel?.youtubeAutoMaxMinutes ?? 10) * 60;
  const autoAllowed = isMusic
    ? !!channel?.autoApproveYoutubeMusic
    : !!channel?.autoApproveYoutubeVideo;
  const autoApproved = autoAllowed && durationSec > 0 && durationSec <= capSec;
  // Sender = the viewer's linked Tossit account, or null (anonymous — dust still accrues to twitch id).
  const link = await db
    .select({ userId: linkedIdentities.userId })
    .from(linkedIdentities)
    .where(
      and(
        eq(linkedIdentities.provider, 'twitch'),
        eq(linkedIdentities.providerId, input.senderTwitchId),
      ),
    )
    .get();
  await createYoutubeSubmission(deps, {
    channelId: input.channelId,
    senderUserId: link?.userId ?? null,
    senderName: input.senderName,
    // Kept even when the account resolved: this is the only handle we have on a sender who never
    // logged in, and it is what a chat command (or the rate limit) can match them by.
    senderPlatform: 'twitch',
    senderPlatformUserId: input.senderTwitchId,
    parsed,
    title: (parsed.caption ?? meta.title ?? undefined)?.slice(0, 280),
    durationMs: durationSec > 0 ? durationSec * 1000 : 0,
    isMusic,
    autoApproved,
    isSelfSend,
  });
  // Send dust (mirrored to the owner) unless the broadcaster requested their own video.
  if (!isSelfSend) {
    await awardDust(input.senderTwitchId, DUST_POINTS.send);
    await awardDust(input.broadcasterId, DUST_POINTS.send);
    deps.io.to(roomOf(input.channelId)).emit('chat:redemption', {
      name: input.senderName,
      dust: DUST_POINTS.send,
    });
  }
  return { autoApproved };
}
