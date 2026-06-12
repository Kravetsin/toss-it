import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

/** Длительность медиа в мс или null, если ffprobe не смог её определить. */
export async function probeDurationMs(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    const seconds = Number.parseFloat(stdout.trim());
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Всё медиа перекодируется в три предсказуемых формата: webp / mp4 / mp3.
 * Это одновременно: обрезка по длительности, защита от экзотических кодеков,
 * которые OBS может не проиграть, удаление метаданных и ограничение размеров.
 */

/** Видео → mp4 (h264 + aac): максимально совместимо с Browser Source. */
export async function transcodeVideo(input: string, output: string, maxMs: number): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', input,
    '-t', String(maxMs / 1000),
    '-vf', "scale=w='min(1280,iw)':h=-2",
    '-r', '30',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-movflags', '+faststart',
    '-map_metadata', '-1',
    output,
  ]);
}

/** Аудио → mp3. */
export async function transcodeAudio(input: string, output: string, maxMs: number): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', input,
    '-t', String(maxMs / 1000),
    '-vn',
    '-c:a', 'libmp3lame',
    '-b:a', '128k',
    '-map_metadata', '-1',
    output,
  ]);
}

/** Картинки (включая анимированные gif) → webp с ограничением размеров. */
export async function processImage(input: string, output: string): Promise<void> {
  await sharp(input, { animated: true })
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(output);
}
