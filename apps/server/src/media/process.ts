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

/**
 * Semaphore for heavy tasks: sharp/ffmpeg hold tens–hundreds of MB of native memory counted
 * against the container limit. Without it, concurrent uploads stack and OOM the instance.
 */
function createSemaphore(max: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  const acquire = async (): Promise<void> => {
    if (active < max) {
      active++;
      return;
    }
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

const runExclusive = createSemaphore(Math.max(1, config.media.concurrency));

/** Removes the partial output file if the task fails midway, else it piles up on disk. */
async function cleanupOnError<T>(output: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    await fsp.rm(output, { force: true });
    throw err;
  }
}

/** Media duration in ms, or null if ffprobe could not determine it. */
export async function probeDurationMs(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        file,
      ],
      { timeout: config.media.ffprobeTimeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
    );
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
  } catch {
    return null;
  }
}

/**
 * All media is re-encoded into three predictable formats (webp/mp4/mp3): this also clamps
 * duration, strips exotic codecs OBS may not play, removes metadata, and limits dimensions.
 */

/** Video → mp4 (h264 + aac): maximally compatible with Browser Source. */
export async function transcodeVideo(input: string, output: string, maxMs: number): Promise<void> {
  await runExclusive(() =>
    cleanupOnError(output, () =>
      execFileAsync(
        'ffmpeg',
        [
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
        ],
        { timeout: config.media.ffmpegTimeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
      ),
    ),
  );
}

/** Audio → mp3. */
export async function transcodeAudio(input: string, output: string, maxMs: number): Promise<void> {
  await runExclusive(() =>
    cleanupOnError(output, () =>
      execFileAsync(
        'ffmpeg',
        [
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
        ],
        { timeout: config.media.ffmpegTimeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
      ),
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
