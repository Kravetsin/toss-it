import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Downloads the Piper TTS binary and voice models into apps/server/data/piper.
 * Idempotent: skips anything already present. Run: pnpm piper:setup
 */

const PIPER_RELEASE = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2';
const VOICES_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';

// Must match TTS_VOICES in src/tts.ts.
const VOICES = [
  'ru/ru_RU/irina/medium/ru_RU-irina-medium',
  'uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium',
  'en/en_US/amy/medium/en_US-amy-medium',
];

const serverRoot = path.resolve(import.meta.dirname, '..');
const piperDir = path.join(serverRoot, 'data', 'piper');
const binDir = path.join(piperDir, 'bin');
const voicesDir = path.join(piperDir, 'voices');
const exeName = process.platform === 'win32' ? 'piper.exe' : 'piper';

function archiveName(): string {
  switch (process.platform) {
    case 'win32':
      return 'piper_windows_amd64.zip';
    case 'darwin':
      return process.arch === 'arm64' ? 'piper_macos_aarch64.tar.gz' : 'piper_macos_x64.tar.gz';
    default:
      return process.arch === 'arm64' ? 'piper_linux_aarch64.tar.gz' : 'piper_linux_x86_64.tar.gz';
  }
}

async function download(url: string, dest: string): Promise<void> {
  console.log(`downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const tmp = `${dest}.tmp`;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(tmp));
  await fsp.rename(tmp, dest);
}

async function installBinary(): Promise<void> {
  if (fs.existsSync(path.join(binDir, exeName))) {
    console.log('piper binary already installed');
    return;
  }
  const archive = archiveName();
  const archivePath = path.join(piperDir, archive);
  await fsp.mkdir(piperDir, { recursive: true });
  await download(`${PIPER_RELEASE}/${archive}`, archivePath);

  // tar handles both .zip (bsdtar on Windows 10+) and .tar.gz.
  const extractDir = path.join(piperDir, 'extract-tmp');
  await fsp.rm(extractDir, { recursive: true, force: true });
  await fsp.mkdir(extractDir, { recursive: true });
  const tar = spawnSync('tar', ['-xf', archivePath, '-C', extractDir], { stdio: 'inherit' });
  if (tar.status !== 0) throw new Error(`tar failed with code ${tar.status}`);

  // Archives contain a top-level piper/ folder — move its contents to bin/.
  await fsp.rm(binDir, { recursive: true, force: true });
  await fsp.rename(path.join(extractDir, 'piper'), binDir);
  await fsp.rm(extractDir, { recursive: true, force: true });
  await fsp.rm(archivePath, { force: true });
  console.log(`piper binary installed to ${binDir}`);
}

async function installVoices(): Promise<void> {
  await fsp.mkdir(voicesDir, { recursive: true });
  for (const voice of VOICES) {
    const name = voice.split('/').at(-1)!;
    for (const ext of ['.onnx', '.onnx.json']) {
      const dest = path.join(voicesDir, `${name}${ext}`);
      if (fs.existsSync(dest)) {
        console.log(`${name}${ext} already present`);
        continue;
      }
      await download(`${VOICES_BASE}/${voice}${ext}?download=true`, dest);
    }
  }
  console.log(`voices installed to ${voicesDir}`);
}

await installBinary();
await installVoices();
console.log('piper setup complete');
