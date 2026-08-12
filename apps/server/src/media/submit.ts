import crypto from 'node:crypto';
import { and, count, eq, gt, ne } from 'drizzle-orm';
import { CHANNEL_POINTS, CHAT_TEXT_MAX_LEN, type MediaKind } from '@tmw/shared';
import { db } from '../db/index';
import {
  channels,
  excludeSelfSends,
  linkedIdentities,
  submissionPayouts,
  submissions,
  whitelist,
  type SubmissionRow,
} from '../db/schema';
import { config } from '../config';
import {
  dashboardRoomOf,
  toLiveSummary,
  type PlaybackManager,
  type RealtimeServer,
} from '../playback';
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
  input: YoutubeSubmissionInput,
): Promise<SubmissionRow> {
  return routeSubmission(deps, buildYoutubeSubmission(input));
}

interface YoutubeSubmissionInput {
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
}

/** The row on its own, stored by nobody yet: whatever is owed on it gets written first. */
function buildYoutubeSubmission(input: YoutubeSubmissionInput): SubmissionRow {
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
    // Chat has no picker; the channel's own layout decides where this lands and how big it is.
    overlayPosition: null,
    overlaySize: null,
    overlayMargin: null,
    isSelfSend: input.isSelfSend ?? false,
  };
  return row;
}

/** Store a submission and send it where its status says: the play queue, or the moderation feed. */
async function routeSubmission(
  deps: { playback: PlaybackManager; io: RealtimeServer },
  row: SubmissionRow,
): Promise<SubmissionRow> {
  await db.insert(submissions).values(row);
  if (row.status === 'approved') {
    deps.playback.enqueue(row);
  } else {
    deps.io.to(dashboardRoomOf(row.channelId)).emit('moderation:new', await toLiveSummary(row));
  }
  return row;
}

/**
 * Has this channel's hourly ceiling for `kind`'s bucket been reached? Text is counted apart from
 * everything else and has its own, much larger budget — see config.moderation. Lives here rather
 * than in each door so a new one cannot quietly become the cheap way past the limit.
 */
export async function hourlyBucketFull(channelId: string, kind: MediaKind): Promise<boolean> {
  const isText = kind === 'text';
  const row = await db
    .select({ n: count() })
    .from(submissions)
    .where(
      and(
        eq(submissions.channelId, channelId),
        gt(submissions.createdAt, new Date(Date.now() - 3_600_000)),
        isText ? eq(submissions.kind, 'text') : ne(submissions.kind, 'text'),
        // The owner's own tests must not eat the viewers' hourly budget.
        excludeSelfSends,
      ),
    )
    .get();
  const limit = isText
    ? config.moderation.channelHourlyLimitText
    : config.moderation.channelHourlyLimit;
  return (row?.n ?? 0) >= limit;
}

/**
 * How long a text card holds the screen: scales with reading time, capped at 15s (enough for the
 * 280 a web send allows). A TTS line longer than that simply finishes after the card is gone.
 */
export function textDurationMs(text: string): number {
  return Math.min(15_000, Math.max(4000, 4000 + 60 * text.length));
}

/**
 * Is the viewer's own caption dropped from this send? Every bypass leans on someone vouching for
 * the content (Giphy's rating, YouTube's moderation) and nobody vouches for a viewer's words — so
 * they are not part of what an instant approval promises. Dropping the caption rather than sending
 * the whole thing to moderation is what keeps those bypasses worth having: most sends carry one.
 * Through moderation, or from a trusted sender, the words stand.
 */
export function dropsCaption(opts: {
  autoApproved: boolean;
  /** Owner or whitelisted — the streamer already vouched for this sender. */
  trusted: boolean;
  autoApproveText: boolean;
  /** The words ARE the submission (kind 'text'); dropping them would leave an empty row on screen. */
  textOnly: boolean;
}): boolean {
  return opts.autoApproved && !opts.trusted && !opts.autoApproveText && !opts.textOnly;
}

/**
 * Is the channel taking sends at all right now? "Stop taking sends" has to mean it at every door,
 * or a streamer clearing their queue mid-stream watches chat and channel points refill it. The
 * broadcaster is exempt, same as on the web — the switch is aimed at viewers, not at testing.
 */
export async function acceptsSends(
  channelId: string,
  broadcasterId: string,
  senderTwitchId: string,
): Promise<boolean> {
  if (senderTwitchId === broadcasterId) return true;
  const row = await db
    .select({ accepting: channels.accepting })
    .from(channels)
    .where(eq(channels.id, channelId))
    .get();
  return row?.accepting ?? true;
}

/**
 * Where a chatter stands with this channel: the Tossit account behind their platform id (null when
 * they never signed in — dust still accrues to the platform id), and whether the streamer already
 * vouched for them. Shared by every non-web entry point so a viewer is judged the same however
 * they send: divergence here is exactly how the whitelist silently stopped applying to chat once.
 */
async function senderStanding(
  channelId: string,
  broadcasterId: string,
  senderTwitchId: string,
): Promise<{ userId: string | null; trusted: boolean; isSelfSend: boolean }> {
  const isSelfSend = senderTwitchId === broadcasterId;
  const link = await db
    .select({ userId: linkedIdentities.userId })
    .from(linkedIdentities)
    .where(
      and(eq(linkedIdentities.provider, 'twitch'), eq(linkedIdentities.providerId, senderTwitchId)),
    )
    .get();
  // The whitelist is keyed by Tossit account, so it can only name a chatter who linked one — and it
  // means the same here as on the web: this viewer's sends air without review, gates included.
  const whitelisted =
    !!link &&
    (await db
      .select()
      .from(whitelist)
      .where(and(eq(whitelist.channelId, channelId), eq(whitelist.userId, link.userId)))
      .get()) !== undefined;
  return { userId: link?.userId ?? null, trusted: isSelfSend || whitelisted, isSelfSend };
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
    /** Present when points were spent: the redemption to settle once the request's fate is known. */
    redemption?: { rewardId: string; redemptionId: string; cost: number };
  },
): Promise<{ autoApproved: boolean; submissionId: string }> {
  const { parsed, meta } = input.resolved;
  const { userId, trusted, isSelfSend } = await senderStanding(
    input.channelId,
    input.broadcasterId,
    input.senderTwitchId,
  );
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
  const autoApproved = trusted || (autoAllowed && durationSec > 0 && durationSec <= capSec);
  // An auto-approved link airs under the video's title instead of the viewer's caption.
  const caption = dropsCaption({
    autoApproved,
    trusted,
    autoApproveText: !!channel?.autoApproveText,
    textOnly: false,
  })
    ? undefined
    : parsed.caption;
  const row = buildYoutubeSubmission({
    channelId: input.channelId,
    senderUserId: userId,
    senderName: input.senderName,
    // Kept even when the account resolved: this is the only handle we have on a sender who never
    // logged in, and it is what a chat command (or the rate limit) can match them by.
    senderPlatform: 'twitch',
    senderPlatformUserId: input.senderTwitchId,
    parsed,
    title: (caption ?? meta.title ?? undefined)?.slice(0, 280),
    durationMs: durationSec > 0 ? durationSec * 1000 : 0,
    isMusic,
    autoApproved,
    isSelfSend,
  });
  // Dust is owed, not paid: a link that never reaches the screen (region-locked, rejected, left in
  // the queue till it expired) pays nobody, and a redemption behind it gets its points back. See
  // settleSubmission. A self-send earns nothing, but when points were spent the row must still
  // exist: it is what carries the verdict back to Twitch, and what tells the backlog sweep this
  // redemption was already taken. Only a self-send with nothing behind it has neither.
  //
  // Written BEFORE the row is stored and queued: the unique index on redemptionId is what makes one
  // redemption twice on screen impossible, and it can only refuse a duplicate that has not aired.
  if (!isSelfSend || input.redemption) {
    await db.insert(submissionPayouts).values({
      submissionId: row.id,
      channelId: input.channelId,
      senderPlatformUserId: input.senderTwitchId,
      broadcasterId: input.broadcasterId,
      // !play costs no points, so it lands on the floor of both rates: a plain send's worth, which
      // is exactly the web mirror it is meant to be. Zeroed for a self-send — the floor is not free.
      dust: isSelfSend ? 0 : CHANNEL_POINTS.dustForRequest(input.redemption?.cost ?? 0),
      mirrorDust: isSelfSend
        ? 0
        : CHANNEL_POINTS.dustForRequest(input.redemption?.cost ?? 0, 'owner'),
      rewardId: input.redemption?.rewardId ?? null,
      redemptionId: input.redemption?.redemptionId ?? null,
      createdAt: new Date(),
    });
  }
  await routeSubmission(deps, row);
  return { autoApproved, submissionId: row.id };
}

/**
 * Put a line on stream — from `!tts <text>` or from a channel-points redemption, which differ only
 * in whether points were spent. Moderation, the queue, the dust and the speaking are all decided by
 * the channel's existing settings rather than by anything special to either door: whether it airs
 * at once is `autoApproveText`, whether it is read aloud is `ttsMessage`, checked at playback.
 */
export async function submitChatText(
  deps: { playback: PlaybackManager; io: RealtimeServer },
  input: {
    channelId: string;
    broadcasterId: string;
    text: string;
    senderTwitchId: string;
    senderName: string;
    /** Present when points were spent: the redemption to settle once the line's fate is known. */
    redemption?: { rewardId: string; redemptionId: string; cost: number };
  },
): Promise<{ autoApproved: boolean; submissionId: string }> {
  const { userId, trusted, isSelfSend } = await senderStanding(
    input.channelId,
    input.broadcasterId,
    input.senderTwitchId,
  );
  const channel = await db.select().from(channels).where(eq(channels.id, input.channelId)).get();
  const text = input.text.slice(0, CHAT_TEXT_MAX_LEN);
  const autoApproved = trusted || !!channel?.autoApproveText;
  const now = new Date();
  const row: SubmissionRow = {
    id: crypto.randomUUID(),
    channelId: input.channelId,
    senderUserId: userId,
    senderName: input.senderName,
    senderPlatform: 'twitch',
    senderPlatformUserId: input.senderTwitchId,
    originalName: '', // no file behind a chat line
    filePath: null,
    text,
    mime: 'text/plain',
    kind: 'text',
    durationMs: textDurationMs(text),
    status: autoApproved ? 'approved' : 'pending',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    youtubeId: null,
    youtubeStart: 0,
    giphyId: null,
    // The channel's default voice: a redemption has no place to pick one, and the paid voices are
    // bought per account — a chatter who never signed in owns none.
    ttsVoice: null,
    overlayPosition: null,
    overlaySize: null,
    overlayMargin: null,
    isSelfSend,
  };
  // Owed, not paid — same as `!play`: a line the streamer rejects, or one that expires unshown,
  // earns nobody anything, and the points behind it come back. See settleSubmission. A paid
  // self-send still gets its row, and it is written before queueing, both for the same reasons as
  // in submitResolvedYoutube.
  if (!isSelfSend || input.redemption) {
    const cost = input.redemption?.cost ?? 0;
    await db.insert(submissionPayouts).values({
      submissionId: row.id,
      channelId: input.channelId,
      senderPlatformUserId: input.senderTwitchId,
      broadcasterId: input.broadcasterId,
      dust: isSelfSend ? 0 : CHANNEL_POINTS.dustForRequest(cost),
      mirrorDust: isSelfSend ? 0 : CHANNEL_POINTS.dustForRequest(cost, 'owner'),
      rewardId: input.redemption?.rewardId ?? null,
      redemptionId: input.redemption?.redemptionId ?? null,
      createdAt: new Date(),
    });
  }
  await routeSubmission(deps, row);
  return { autoApproved, submissionId: row.id };
}
