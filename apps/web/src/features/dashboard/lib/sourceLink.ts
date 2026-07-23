import { giphyGifUrl, type SubmissionSummary } from '@tmw/shared';

/** mime subtype → the extension people expect to see on disk. */
const EXT: Record<string, string> = {
  jpeg: 'jpg',
  quicktime: 'mov',
  mpeg: 'mp3',
  'x-m4a': 'm4a',
  'svg+xml': 'svg',
};

/**
 * Where the streamer can grab the original. Our own files download straight away; third-party media
 * (Giphy, YouTube) can only be opened — `download` is same-origin by spec, and pulling video off
 * YouTube is against its terms either way.
 */
export function sourceLink(s: SubmissionSummary): { href: string; download?: string } | null {
  if (s.kind === 'text') return null;
  if (s.kind === 'youtube') return s.youtubeId ? { href: `https://youtu.be/${s.youtubeId}` } : null;
  // A gif is either a Giphy pick (no file of ours) or a plain uploaded .gif — fall through for the latter.
  if (s.kind === 'gif' && s.giphyId) return { href: giphyGifUrl(s.giphyId) };
  const subtype = s.mime.split('/')[1] ?? '';
  const ext = EXT[subtype] ?? subtype.replace(/[^a-z0-9]/gi, '');
  return { href: s.url, download: `tossit-${s.id}${ext ? `.${ext}` : ''}` };
}
