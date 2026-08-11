import { and, count, eq, gte, inArray, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { STREAM_PLATFORMS } from '@tmw/shared';
import type { ChannelLink, DirectoryChannel, StreamPlatform } from '@tmw/shared';
import { db } from '../db/index';
import { channels, excludeSelfSends, submissions, users } from '../db/schema';
import type { PlaybackManager } from '../playback';

/** Public and polled by every open drawer, so repeated hits are served from memory. */
const CACHE_MS = 10_000;
/** How long a channel keeps showing up after its overlay left. */
const RECENT_MS = 24 * 60 * 60 * 1000;
/** Cap on the "was live recently" group — the live group is never capped. */
const RECENT_MAX = 30;

let cache: { at: number; rows: DirectoryChannel[] } | null = null;

/** Their stream page: a stream link they listed, else the Twitch login they signed in with. */
function streamOf(
  links: ChannelLink[],
  userId: string,
  login: string,
): { url: string | null; platform: StreamPlatform | null } {
  const listed = (links ?? []).find((l): l is ChannelLink & { platform: StreamPlatform } =>
    (STREAM_PLATFORMS as readonly string[]).includes(l.platform),
  );
  if (listed) return { url: listed.url, platform: listed.platform };
  if (userId.startsWith('twitch:')) {
    return { url: `https://www.twitch.tv/${login}`, platform: 'twitch' };
  }
  return { url: null, platform: null };
}

export function registerDirectoryRoutes(
  app: FastifyInstance,
  deps: { playback: PlaybackManager },
): void {
  /**
   * Channels taking sends right now: overlay connected (`live`), plus the ones whose overlay left
   * within RECENT_MS — without that second group the list would read as empty most of the day.
   * Public on purpose: every field here is already on the channel's own page.
   */
  app.get('/api/directory', async (): Promise<DirectoryChannel[]> => {
    if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;
    const liveIds = [...deps.playback.liveChannels().keys()];
    const seenSince = [gte(channels.lastLiveAt, new Date(Date.now() - RECENT_MS))];
    // Guarded: an empty inArray is not valid SQL, and early on nobody is live.
    if (liveIds.length > 0) seenSince.push(inArray(channels.id, liveIds));
    const rows = await db
      .select({
        id: channels.id,
        ownerUserId: channels.ownerUserId,
        login: users.login,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
        description: channels.description,
        links: channels.links,
        lastLiveAt: channels.lastLiveAt,
        founderSince: users.founderSince,
        maxDurationMs: channels.maxDurationMs,
        maxAudioDurationMs: channels.maxAudioDurationMs,
        maxFileSizeBytes: channels.maxFileSizeBytes,
        autoApproveGifs: channels.autoApproveGifs,
        autoApproveText: channels.autoApproveText,
        autoApproveYoutubeMusic: channels.autoApproveYoutubeMusic,
        autoApproveYoutubeVideo: channels.autoApproveYoutubeVideo,
        ttsName: channels.ttsName,
        ttsMessage: channels.ttsMessage,
        allowViewerPosition: channels.allowViewerPosition,
        equipped: users.equipped,
      })
      .from(channels)
      .innerJoin(users, eq(users.id, channels.ownerUserId))
      // A paused channel is not taking sends, so listing it as such would be a lie.
      .where(and(eq(channels.accepting, true), or(...seenSince)))
      .all();

    // One grouped count for the whole page rather than a query per card.
    const airedRows =
      rows.length > 0
        ? await db
            .select({ channelId: submissions.channelId, n: count() })
            .from(submissions)
            .where(
              and(
                inArray(
                  submissions.channelId,
                  rows.map((r) => r.id),
                ),
                eq(submissions.status, 'played'),
                excludeSelfSends,
              ),
            )
            .groupBy(submissions.channelId)
            .all()
        : [];
    const aired = new Map(airedRows.map((r) => [r.channelId, r.n]));

    const live = new Set(liveIds);
    const mapped = rows.map((r): DirectoryChannel => {
      const stream = streamOf(r.links, r.ownerUserId, r.login);
      const isLive = live.has(r.id);
      return {
        login: r.login,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        description: r.description,
        streamUrl: stream.url,
        streamPlatform: stream.platform,
        live: isLive,
        lastLiveAt: isLive ? null : (r.lastLiveAt?.getTime() ?? null),
        isFounder: r.founderSince != null,
        aired: aired.get(r.id) ?? 0,
        maxDurationMs: r.maxDurationMs,
        maxAudioDurationMs: r.maxAudioDurationMs,
        maxFileSizeBytes: r.maxFileSizeBytes,
        autoApproveGifs: r.autoApproveGifs,
        autoApproveText: r.autoApproveText,
        // Collapsed like the channel page does it: the card only needs "can a link air unmoderated".
        autoApproveYoutube: r.autoApproveYoutubeMusic || r.autoApproveYoutubeVideo,
        ttsEnabled: r.ttsName || r.ttsMessage,
        allowViewerPosition: r.allowViewerPosition,
        nickColor: r.equipped?.nickColor ?? null,
        nickColor2: r.equipped?.nickColor2 ?? null,
        nickFlow: r.equipped?.nickFlow ?? false,
        nickEffect: r.equipped?.nickEffect ?? null,
        cardEffect: r.equipped?.cardEffect ?? null,
        cardEffectColor:
          (r.equipped?.cardEffect && r.equipped.cardEffectColors?.[r.equipped.cardEffect]) ?? null,
      };
    });
    // Live group in a fixed order (the client rotates it per visitor so exposure isn't first-come),
    // recent group newest first — a time order, deliberately not a popularity ranking.
    const out = [
      ...mapped.filter((r) => r.live).sort((a, b) => a.login.localeCompare(b.login)),
      ...mapped
        .filter((r) => !r.live)
        .sort((a, b) => (b.lastLiveAt ?? 0) - (a.lastLiveAt ?? 0))
        .slice(0, RECENT_MAX),
    ];
    cache = { at: Date.now(), rows: out };
    return out;
  });
}
