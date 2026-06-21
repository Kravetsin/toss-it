import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fsp from 'node:fs/promises';
import sharp from 'sharp';
import { config } from '../config';

const execFileAsync = promisify(execFile);

// libvips' op cache (~50MB) and per-core worker threads are native memory counted against
// the container. Disable cache, decode single-threaded: tasks are serialized by the semaphore below.
sharp.cache(false);
sharp.concurrency(1);

/** Thrown when too many heavy tasks are already queued: the caller maps it to a 503 so a
 *  burst fails fast instead of stacking tmp files, native RAM and open sockets. */
export class MediaQueueFullError extends Error {
  constructor() {
    super('media queue full');
    this.name = 'MediaQueueFullError';
  }
}

/** Max tasks allowed to wait behind the active ones before new uploads are rejected. */
const MEDIA_QUEUE_LIMIT = 12;

/**
 * Semaphore for heavy tasks: sharp/ffmpeg hold tens–hundreds of MB of native memory counted
 * against the container limit. Without it, concurrent uploads stack and OOM the instance.
 */
function createSemaphore(max: number, maxQueue: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  const acquire = async (): Promise<void> => {
    if (active < max) {
      active++;
      return;
    }
    // Bounded wait queue: past the cap, fail fast rather than pile up unbounded.
    if (waiters.length >= maxQueue) throw new MediaQueueFullError();
    // Slot full: wait for release() to hand it over (active unchanged on handoff).
    await new Promise<void>((resolve) => waiters.push(resolve));
  };
  const release = (): void => {
    const next = waiters.shift();
    if (next) next();
    else active--;
  };
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

const runExclusive = createSemaphore(Math.max(1, config.media.concurrency), MEDIA_QUEUE_LIMIT);

/** Removes the partial output file if the task fails midway, else it piles up on disk. */
async function cleanupOnError<T>(output: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    await fsp.rm(output, { force: true });
    throw err;
  }
}

export interface MediaInfo {
  durationMs: number;
  /** First video stream, if any (null for audio-only). */
  video: { codec: string; width: number; pixFmt: string } | null;
  /** First audio stream, if any. */
  audio: { codec: string } | null;
}

/** Duration + codecs in one ffprobe call, or null if it could not be read. */
export async function probeMedia(file: string): Promise<MediaInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration:stream=codec_type,codec_name,width,pix_fmt',
        '-of',
        'json',
        file,
      ],
      { timeout: config.media.ffprobeTimeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{
        codec_type?: string;
        codec_name?: string;
        width?: number;
        pix_fmt?: string;
      }>;
      format?: { duration?: string };
    };
    const seconds = Number.parseFloat(parsed.format?.duration ?? '');
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const streams = parsed.streams ?? [];
    const v = streams.find((s) => s.codec_type === 'video');
    const a = streams.find((s) => s.codec_type === 'audio');
    return {
      durationMs: Math.round(seconds * 1000),
      video: v?.codec_name
        ? { codec: v.codec_name, width: v.width ?? 0, pixFmt: v.pix_fmt ?? '' }
        : null,
      audio: a?.codec_name ? { codec: a.codec_name } : null,
    };
  } catch {
    return null;
  }
}

/**
 * All media is re-encoded into three predictable formats (webp/mp4/mp3): this also clamps
 * duration, strips exotic codecs OBS may not play, removes metadata, and limits dimensions.
 */

/**
 * Video → mp4 (h264 + aac): maximally compatible with Browser Source.
 * Fast path: a source that is already h264/aac, ≤1280px wide, yuv420p and within the
 * duration limit is stream-copied (remux) — near-free vs a full re-encode, and the common
 * case for phone/OBS clips. Anything else gets the full normalizing transcode.
 */
export async function transcodeVideo(
  input: string,
  output: string,
  maxMs: number,
  info: MediaInfo,
): Promise<void> {
  const v = info.video;
  const canCopy =
    v !== null &&
    v.codec === 'h264' &&
    v.width <= 1280 &&
    v.pixFmt === 'yuv420p' &&
    (info.audio === null || info.audio.codec === 'aac') &&
    info.durationMs <= maxMs;
  // Copy path only when no trim is needed, so we never cut at a stray keyframe.
  const args = canCopy
    ? ['-y', '-i', input, '-c', 'copy', '-movflags', '+faststart', '-map_metadata', '-1', output]
    : [
        '-y',
        '-i',
        input,
        '-t',
        String(maxMs / 1000),
        '-vf',
        "scale=w='min(1280,iw)':h=-2",
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-ac',
        '2',
        '-movflags',
        '+faststart',
        '-map_metadata',
        '-1',
        // Single thread: on shared CPU caps both encoder memory and core load.
        '-threads',
        '1',
        output,
      ];
  await runExclusive(() =>
    cleanupOnError(output, () =>
      execFileAsync('ffmpeg', args, {
        timeout: config.media.ffmpegTimeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
      }),
    ),
  );
}

/** Audio → mp3. Fast path: already-mp3 within the limit is stream-copied, not re-encoded. */
export async function transcodeAudio(
  input: string,
  output: string,
  maxMs: number,
  info: MediaInfo,
): Promise<void> {
  const canCopy = info.audio?.codec === 'mp3' && info.durationMs <= maxMs;
  const args = canCopy
    ? ['-y', '-i', input, '-vn', '-c:a', 'copy', '-map_metadata', '-1', output]
    : [
        '-y',
        '-i',
        input,
        '-t',
        String(maxMs / 1000),
        '-vn',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-map_metadata',
        '-1',
        '-threads',
        '1',
        output,
      ];
  await runExclusive(() =>
    cleanupOnError(output, () =>
      execFileAsync('ffmpeg', args, {
        timeout: config.media.ffmpegTimeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: 1024 * 1024,
      }),
    ),
  );
}

/** Images (including animated gifs) → webp with size limits. */
export async function processImage(input: string, output: string): Promise<void> {
  await runExclusive(() =>
    cleanupOnError(output, async () => {
      // metadata() reads only the header (no frame decode) — cheap. {animated:true} expands all
      // frames to raw RGBA (w*h*4*frames); a small gif can balloon to hundreds of MB and OOM.
      // So estimate expanded size first; if over budget, decode a single frame instead.
      const meta = await sharp(input).metadata();
      const frames = meta.pages ?? 1;
      const surfaceBytes = (meta.width ?? 0) * (meta.height ?? 0) * 4 * frames;
      const animated = frames > 1 && surfaceBytes <= config.media.animatedPixelBudgetBytes;

      await sharp(input, { animated, limitInputPixels: config.media.maxInputPixels })
        .timeout({ seconds: Math.round(config.media.ffmpegTimeoutMs / 1000) })
        .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(output);
    }),
  );
}
