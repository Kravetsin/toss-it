/**
 * YouTube link parse/validate. Not downloaded/transcoded: store videoId + start
 * second only; overlay plays via embedded IFrame player.
 */

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
