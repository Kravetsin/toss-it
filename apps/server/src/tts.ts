import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';

/**
 * Local TTS via Piper (https://github.com/rhasspy/piper): standalone binary,
 * CPU-only, ~0.1 RTF on the host. Binary + voices are downloaded into
 * data/piper by `pnpm piper:setup`; until then synthesize() returns null and
 * the route falls back to the Google Translate proxy.
 */

const serverRoot = path.resolve(import.meta.dirname, '..');
const piperDir = path.join(serverRoot, 'data', 'piper');
const binPath = path.join(piperDir, 'bin', process.platform === 'win32' ? 'piper.exe' : 'piper');
const voicesDir = path.join(piperDir, 'voices');
const cacheDir = path.join(serverRoot, 'data', 'tts-cache');

export const TTS_VOICES: Record<string, string> = {
  ru: 'ru_RU-irina-medium',
  uk: 'uk_UA-ukrainian_tts-medium',
  en: 'en_US-amy-medium',
};

const SYNTH_TIMEOUT_MS = 30_000;
const CACHE_MAX_BYTES = 500 * 1024 * 1024;
const CACHE_SWEEP_EVERY = 100;

export function detectTtsLang(text: string): keyof typeof TTS_VOICES {
  if (config.tts.lang && config.tts.lang in TTS_VOICES) return config.tts.lang;
  // і/ї/є/ґ are Ukrainian-only; the rest of Cyrillic defaults to Russian.
  if (/[іїєґ]/i.test(text)) return 'uk';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  return 'en';
}

let warnedUnavailable = false;

/** Absolute path the piper binary is expected at (logged for diagnostics). */
export const ttsBinPath = binPath;

export function ttsAvailable(): boolean {
  const ok = fs.existsSync(binPath);
  if (!ok && !warnedUnavailable) {
    warnedUnavailable = true;
    console.warn(
      `Piper TTS not installed (expected at ${binPath}) — run \`pnpm piper:setup\`; falling back to Google TTS`,
    );
  }
  return ok;
}

/** Dedupe concurrent requests for the same text (overlay reconnects retry fast). */
const inFlight = new Map<string, Promise<Buffer | null>>();
let writesSinceSweep = 0;

/** WAV audio for the text, or null when piper/voice is missing (caller falls back). */
export async function synthesize(text: string): Promise<Buffer | null> {
  if (!ttsAvailable()) return null;
  const voice = TTS_VOICES[detectTtsLang(text)];
  const modelPath = path.join(voicesDir, `${voice}.onnx`);
  if (!fs.existsSync(modelPath)) return null;

  const key = crypto
    .createHash('sha1')
    .update(voice + '\n' + text)
    .digest('hex');
  const cacheFile = path.join(cacheDir, `${key}.wav`);
  try {
    const cached = await fsp.readFile(cacheFile);
    // Touch mtime: it doubles as the LRU mark for cache eviction.
    fsp.utimes(cacheFile, new Date(), new Date()).catch(() => {});
    return cached;
  } catch {
    // not cached
  }

  const pending = inFlight.get(key);
  if (pending) return pending;
  // Piper writes to a file, not stdout: on Windows its stdout is in text mode
  // and CRLF translation corrupts the PCM data (loud static over the voice).
  const tmpFile = `${cacheFile}.${process.pid}.tmp`;
  const task = (async () => {
    await fsp.mkdir(cacheDir, { recursive: true });
    try {
      await runPiper(modelPath, text, tmpFile);
      const wav = await fsp.readFile(tmpFile);
      if (wav.length === 0) throw new Error('piper produced empty output');
      await cacheCommit(tmpFile, cacheFile);
      return wav;
    } finally {
      await fsp.rm(tmpFile, { force: true }).catch(() => {});
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, task);
  return task;
}

function runPiper(modelPath: string, text: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binPath, ['--model', modelPath, '--output_file', outFile], {
      cwd: path.dirname(binPath),
      windowsHide: true,
    });
    const timer = setTimeout(() => proc.kill(), SYNTH_TIMEOUT_MS);
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`piper exited with code ${code}`));
    });
    proc.stdin.on('error', () => {});
    proc.stdin.end(text.replace(/\s+/g, ' ').trim() + '\n');
  });
}

async function cacheCommit(tmpFile: string, file: string): Promise<void> {
  try {
    await fsp.rename(tmpFile, file);
    if (++writesSinceSweep >= CACHE_SWEEP_EVERY) {
      writesSinceSweep = 0;
      void sweepCache().catch(() => {});
    }
  } catch {
    // cache is best-effort
  }
}

/** Keep the cache under CACHE_MAX_BYTES by evicting least recently used files. */
async function sweepCache(): Promise<void> {
  const names = await fsp.readdir(cacheDir);
  const files: { file: string; size: number; mtime: number }[] = [];
  for (const name of names) {
    const file = path.join(cacheDir, name);
    const st = await fsp.stat(file).catch(() => null);
    if (st?.isFile()) files.push({ file, size: st.size, mtime: st.mtimeMs });
  }
  let total = files.reduce((s, f) => s + f.size, 0);
  if (total <= CACHE_MAX_BYTES) return;
  files.sort((a, b) => a.mtime - b.mtime);
  for (const f of files) {
    if (total <= CACHE_MAX_BYTES * 0.8) break;
    await fsp.rm(f.file, { force: true });
    total -= f.size;
  }
}
