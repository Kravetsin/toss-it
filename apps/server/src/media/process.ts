import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fsp from 'node:fs/promises';
import sharp from 'sharp';
import { config } from '../config';

const execFileAsync = promisify(execFile);

// libvips держит свой операционный кэш (~50МБ) и плодит воркер-треды по числу ядер —
// на маленьком инстансе это лишняя нативная память, которая считается контейнером.
// Кэш выключаем, декод ведём в один тред: задачи и так сериализуются семафором ниже.
sharp.cache(false);
sharp.concurrency(1);

/**
 * Семафор на тяжёлые задачи. sharp-декод и ffmpeg держат десятки–сотни МБ НАТИВНОЙ
 * памяти (вне V8-кучи), которая целиком ложится на лимит контейнера. Без ограничения
 * параллелизма пачка одновременных аплоадов складывает эту память и роняет инстанс по
 * OOM (rate-limit считает запросы в минуту, но не число одновременных задач).
 * По умолчанию — одна задача за раз; на инстансе побольше можно поднять MEDIA_CONCURRENCY.
 */
function createSemaphore(max: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  const acquire = async (): Promise<void> => {
    if (active < max) {
      active++;
      return;
    }
    // Слот занят — ждём, пока release() передаст его нам (active при передаче не меняется).
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

/** Удаляет недописанный выходной файл, если задача упала на полпути (иначе он копится на диске). */
async function cleanupOnError<T>(output: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (err) {
    await fsp.rm(output, { force: true });
    throw err;
  }
}

/** Длительность медиа в мс или null, если ffprobe не смог её определить. */
export async function probeDurationMs(file: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
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
 * Всё медиа перекодируется в три предсказуемых формата: webp / mp4 / mp3.
 * Это одновременно: обрезка по длительности, защита от экзотических кодеков,
 * которые OBS может не проиграть, удаление метаданных и ограничение размеров.
 */

/** Видео → mp4 (h264 + aac): максимально совместимо с Browser Source. */
export async function transcodeVideo(input: string, output: string, maxMs: number): Promise<void> {
  await runExclusive(() =>
    cleanupOnError(output, () =>
      execFileAsync(
        'ffmpeg',
        [
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
          // Один тред: на shared-CPU ограничивает и память кодера, и нагрузку на ядро.
          '-threads', '1',
          output,
        ],
        { timeout: config.media.ffmpegTimeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
      ),
    ),
  );
}

/** Аудио → mp3. */
export async function transcodeAudio(input: string, output: string, maxMs: number): Promise<void> {
  await runExclusive(() =>
    cleanupOnError(output, () =>
      execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-i', input,
          '-t', String(maxMs / 1000),
          '-vn',
          '-c:a', 'libmp3lame',
          '-b:a', '128k',
          '-map_metadata', '-1',
          '-threads', '1',
          output,
        ],
        { timeout: config.media.ffmpegTimeoutMs, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
      ),
    ),
  );
}

/** Картинки (включая анимированные gif) → webp с ограничением размеров. */
export async function processImage(input: string, output: string): Promise<void> {
  await runExclusive(() =>
    cleanupOnError(output, async () => {
      // metadata() читает только заголовок (кадры НЕ декодирует) — дёшево.
      // {animated:true} разворачивает все кадры в сырой RGBA сразу: w*h*4*кадры байт.
      // Сжатая гифка в пределах лимита файла может развернуться в сотни МБ — это и есть
      // путь к OOM. Поэтому считаем «развёрнутый» размер заранее и, если он больше бюджета,
      // не декодируем анимацию — отдаём один кадр (картинка пройдёт, просто без анимации).
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
