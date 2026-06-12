import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

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
 * Обрезает видео/аудио до maxMs без перекодирования (stream copy).
 * Точность отсечки — до границы пакета; для лимита показа этого достаточно,
 * а honest-перекодирование в безопасные форматы появится в фазе 5.
 */
export async function trimTo(input: string, output: string, maxMs: number): Promise<void> {
  await execFileAsync('ffmpeg', [
    '-y',
    '-i', input,
    '-t', String(maxMs / 1000),
    '-c', 'copy',
    output,
  ]);
}
