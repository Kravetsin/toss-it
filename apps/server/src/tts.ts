import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ttsVoiceModule, ttsVoices, type TtsLang, type TtsVoiceModule } from '@tmw/shared';
import { config } from './config';

/**
 * Local TTS via Piper (https://github.com/rhasspy/piper): standalone binary,
 * CPU-only, ~0.1 RTF on the host. Binary + voices are downloaded into
 * data/piper by `pnpm piper:setup`; until then synthesize() returns null and
 * the route falls back to the Google Translate proxy.
 */

const serverRoot = path.resolve(import.meta.dirname, '..');
const piperDir = config.tts.piperDir ?? path.join(serverRoot, 'data', 'piper');
const binPath = path.join(piperDir, 'bin', process.platform === 'win32' ? 'piper.exe' : 'piper');
const voicesDir = path.join(piperDir, 'voices');
const cacheDir = path.join(serverRoot, 'data', 'tts-cache');

const SYNTH_TIMEOUT_MS = 30_000;
const CACHE_MAX_BYTES = 500 * 1024 * 1024;
const CACHE_SWEEP_EVERY = 100;

/**
 * Anything our ru/uk/en voices can actually pronounce. Everything else is dropped: Piper's
 * phonemizer has no mapping for other scripts and falls back to spelling each character by its
 * Unicode name — a Japanese track title comes out as "Japanese letter" thirty times over.
 */
const SPEAKABLE_CHAR = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Nd}]/u;
const UNSPEAKABLE = /[^\p{Script=Latin}\p{Script=Cyrillic}\p{Nd}\s'’\-–—.,!?:;()"«»]/gu;
/** Letters/digits of ANY script — the denominator for "how much of this can we say?". */
const WORD_CHAR = /[\p{L}\p{Nd}]/gu;
/** Below this share of pronounceable word characters, what survives is debris, not a title. */
const SPEAKABLE_RATIO_MIN = 0.5;

/**
 * The pronounceable part of `raw`, or null when speaking it would be worse than silence.
 *
 * Stripping alone isn't enough: "【オリジナル楽曲】…【IOSYS（まろん&D.watt）】" reduces to a
 * handful of bracketed latin fragments that read as gibberish, so a title that is mostly
 * unpronounceable is skipped outright rather than half-read.
 */
export function speakableText(raw: string): string | null {
  const cleaned = raw
    .replace(UNSPEAKABLE, ' ')
    // Punctuation left stranded where a stripped run used to be ("IOSYS ( & D.watt )").
    .replace(/\s+([.,!?:;)»"])/g, '$1')
    .replace(/([(«"])\s+/g, '$1')
    .replace(/[([«]\s*[)\]»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const speakable = [...cleaned].filter((c) => SPEAKABLE_CHAR.test(c)).length;
  // A single stray letter is never worth a voice line.
  if (speakable < 2) return null;
  const total = (raw.match(WORD_CHAR) ?? []).length;
  if (speakable / total < SPEAKABLE_RATIO_MIN) return null;
  return cleaned;
}

export function detectTtsLang(text: string): TtsLang {
  const forced = config.tts.lang;
  if (forced === 'ru' || forced === 'uk' || forced === 'en') return forced;
  // і/ї/є/ґ are Ukrainian-only; the rest of Cyrillic defaults to Russian.
  if (/[іїєґ]/i.test(text)) return 'uk';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  return 'en';
}

/**
 * Voice for a synthesis: the picked catalog id, or a RANDOM voice of the text's language —
 * randomness is the free tier, buying a voice is what buys control. `seed` (submission id)
 * makes the pick stable, so name+message and replays of one submission share a voice.
 */
function resolveVoice(
  text: string,
  voiceId?: string | null,
  seed?: string,
): TtsVoiceModule | undefined {
  if (voiceId) {
    const picked = ttsVoiceModule(voiceId);
    if (picked) return picked;
  }
  const lang = detectTtsLang(text);
  const pool = ttsVoices.filter((v) => v.lang === lang);
  if (pool.length === 0) return undefined;
  const idx = seed
    ? crypto.createHash('sha1').update(seed).digest().readUInt32BE(0) % pool.length
    : Math.floor(Math.random() * pool.length);
  return pool[idx];
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
export async function synthesize(
  text: string,
  voiceId?: string | null,
  seed?: string,
): Promise<Buffer | null> {
  if (!ttsAvailable()) return null;
  const voice = resolveVoice(text, voiceId, seed);
  if (!voice) return null;
  const modelPath = path.join(voicesDir, `${voice.model}.onnx`);
  if (!fs.existsSync(modelPath)) return null;

  const key = crypto
    .createHash('sha1')
    .update(`${voice.model}#${voice.speaker ?? 0}\n${text}`)
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
      await runPiper(modelPath, voice.speaker, text, tmpFile);
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

function runPiper(
  modelPath: string,
  speaker: number | undefined,
  text: string,
  outFile: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['--model', modelPath, '--output_file', outFile];
    if (speaker !== undefined) args.push('--speaker', String(speaker));
    const proc = spawn(binPath, args, {
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
