/**
 * YouTube link parse/validate. Not downloaded/transcoded: store videoId + start
 * second only; overlay plays via embedded IFrame player.
 */

import type { MusicTrack } from '@tmw/shared';
import { config } from '../config';

export interface ParsedYoutube {
  videoId: string;
  /** Start second from link timecode (t / start / #t); 0 means beginning. */
  startSeconds: number;
  /** Leftover text minus the URL, used as caption. */
  caption?: string;
  /** From music.youtube.com — render as compact music player. */
  isMusic: boolean;
}

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Extracts videoId/timecode from the first YouTube URL in text, else null. */
export function parseYoutube(input: string): ParsedYoutube | null {
  const urlMatch = input.match(/https?:\/\/[^\s]+/i);
  if (!urlMatch) return null;

  let url: URL;
  try {
    url = new URL(urlMatch[0]);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
  let videoId: string | null = null;

  if (host === 'youtu.be') {
    videoId = url.pathname.slice(1).split('/')[0] || null;
  } else if (
    host === 'youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    if (url.pathname === '/watch') {
      videoId = url.searchParams.get('v');
    } else if (/^\/(shorts|embed|live|v)\//.test(url.pathname)) {
      videoId = url.pathname.split('/')[2] ?? null;
    }
  }

  if (!videoId || !VIDEO_ID_RE.test(videoId)) return null;

  const startSeconds = parseStart(
    url.searchParams.get('t') ?? url.searchParams.get('start') ?? url.hash.replace(/^#t?=?/, ''),
  );
  const caption = input.replace(urlMatch[0], ' ').replace(/\s+/g, ' ').trim() || undefined;

  return { videoId, startSeconds, caption, isMusic: host === 'music.youtube.com' };
}

/** Timecode "90","90s","1m30s","1h2m3s" -> seconds; capped at 24h vs garbage/overflow. */
function parseStart(raw: string | null): number {
  if (!raw) return 0;
  let total: number;
  if (/^\d+$/.test(raw)) {
    total = Number(raw);
  } else {
    const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!m) return 0;
    total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  }
  return Number.isFinite(total) && total > 0 ? Math.min(Math.floor(total), 86_400) : 0;
}

interface PlaylistCacheEntry {
  at: number;
  tracks: MusicTrack[];
}
const playlistCache = new Map<string, PlaylistCacheEntry>();
const PLAYLIST_CACHE_MS = 10 * 60_000;
const MAX_TRACKS = 300;

/**
 * Ordered tracks of a YouTube playlist via the Data API (needs YOUTUBE_API_KEY).
 * Cached in-memory (playlists rarely change). Returns [] with no key or on error.
 */
export async function fetchPlaylistTracks(playlistId: string): Promise<MusicTrack[]> {
  if (!config.youtube.apiKey) return [];
  const cached = playlistCache.get(playlistId);
  if (cached && Date.now() - cached.at < PLAYLIST_CACHE_MS) return cached.tracks;

  const tracks: MusicTrack[] = [];
  let pageToken = '';
  try {
    do {
      const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('maxResults', '50');
      url.searchParams.set('playlistId', playlistId);
      url.searchParams.set('key', config.youtube.apiKey);
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) break;
      const data = (await res.json()) as {
        items?: { snippet?: { title?: string; resourceId?: { videoId?: string } } }[];
        nextPageToken?: string;
      };
      for (const it of data.items ?? []) {
        const videoId = it.snippet?.resourceId?.videoId;
        const title = it.snippet?.title ?? '';
        // Unavailable items surface as these placeholder titles — skip them.
        if (videoId && title !== 'Private video' && title !== 'Deleted video') {
          tracks.push({ videoId, title });
        }
      }
      pageToken = data.nextPageToken ?? '';
    } while (pageToken && tracks.length < MAX_TRACKS);
  } catch {
    return cached?.tracks ?? [];
  }
  playlistCache.set(playlistId, { at: Date.now(), tracks });
  return tracks;
}

/**
 * Track lengths in seconds via the Data API (50 ids per call). Best-effort:
 * empty map with no key or on error — durations are cosmetic.
 */
export async function fetchVideoDurations(videoIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!config.youtube.apiKey || videoIds.length === 0) return out;
  try {
    for (let i = 0; i < videoIds.length; i += 50) {
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.searchParams.set('part', 'contentDetails');
      url.searchParams.set('id', videoIds.slice(i, i + 50).join(','));
      url.searchParams.set('key', config.youtube.apiKey);
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) break;
      const data = (await res.json()) as {
        items?: { id?: string; contentDetails?: { duration?: string } }[];
      };
      for (const it of data.items ?? []) {
        const sec = parseIsoDuration(it.contentDetails?.duration ?? '');
        if (it.id && sec > 0) out.set(it.id, sec);
      }
    }
  } catch {
    // timeouts/network — leave whatever was collected
  }
  return out;
}

/** ISO 8601 duration ("PT1H2M3S") -> seconds; 0 on anything else (e.g. "P0D" for live). */
function parseIsoDuration(iso: string): number {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * Checks existence + embeddability via public oEmbed (no API key). Returns title,
 * or null if private/deleted/embedding disabled.
 */
export async function validateYoutube(videoId: string): Promise<{ title: string } | null> {
  const oembed = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}`;
  try {
    const res = await fetch(oembed, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string };
    return { title: data.title ?? '' };
  } catch {
    return null;
  }
}
