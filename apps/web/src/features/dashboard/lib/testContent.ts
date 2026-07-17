/**
 * Sample payloads for the overlay test button. Everything is built here on demand rather than
 * shipped as assets: the image and the tone are generated, so the only bytes we fetch are the
 * video the repo already carries for the dev mock.
 */

export const TEST_POST_KINDS = ['text', 'image', 'video', 'audio', 'youtube', 'gif'] as const;
export type TestPostKind = (typeof TEST_POST_KINDS)[number];

/** What a test of this kind sends to the real upload endpoint. */
export interface TestPayload {
  file?: File;
  text?: string;
  giphyId?: string;
}

/** Long enough to hear the voice and judge the volume, short enough not to hold the stage. */
const TEST_TEXT =
  'Проверка связи: так звучит озвучка и так выглядит текст на стриме. Хватает ли времени прочитать?';
const TEST_CAPTION = 'тестовая подпись';
/** Public domain (Blender Foundation), stable and safe to air. */
const TEST_YOUTUBE = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';
/** Giphy's own "hello" GIF — a stable, always-available id. */
const TEST_GIPHY_ID = 'l0MYt5jPR6QX5pnqM';

/** Test card: the grid and the corner ticks make it obvious where the media edges land in OBS. */
async function testCardPng(): Promise<File> {
  const w = 1280;
  const h = 720;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#0d1111');
  bg.addColorStop(1, '#123');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#8df0cc33';
  ctx.lineWidth = 2;
  for (let x = 0; x <= w; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += 80) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  ctx.strokeStyle = '#8df0cc';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);

  ctx.fillStyle = '#8df0cc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 120px ui-monospace, monospace';
  ctx.fillText('TOSSIT', w / 2, h / 2 - 40);
  ctx.font = '40px ui-monospace, monospace';
  ctx.fillStyle = '#ededec';
  ctx.fillText(`${w}×${h} · тестовая картинка`, w / 2, h / 2 + 60);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('canvas encode failed');
  return new File([blob], 'test-card.png', { type: 'image/png' });
}

/**
 * A short arpeggio as a WAV (the server re-encodes it to mp3 anyway). Audible on purpose: a silent
 * sample would test the player but not the volume, which is the thing being tuned.
 */
function toneWav(seconds = 6): File {
  const rate = 22_050;
  const total = Math.floor(rate * seconds);
  const bytes = total * 2;
  const buf = new ArrayBuffer(44 + bytes);
  const dv = new DataView(buf);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + bytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ascii(36, 'data');
  dv.setUint32(40, bytes, true);

  const notes = [440, 554.37, 659.25, 880]; // A4 major arpeggio
  const noteLen = total / notes.length;
  for (let i = 0; i < total; i++) {
    const freq = notes[Math.min(notes.length - 1, Math.floor(i / noteLen))]!;
    // Fade each note in/out so the steps don't click.
    const inNote = (i % noteLen) / noteLen;
    const env = Math.sin(Math.PI * inNote) ** 0.5;
    const v = Math.sin((2 * Math.PI * freq * i) / rate) * env * 0.35;
    dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
  }
  return new File([buf], 'test-tone.wav', { type: 'audio/wav' });
}

async function mockVideoFile(): Promise<File> {
  const res = await fetch('/mock-video.mp4');
  if (!res.ok) throw new Error('mock-video.mp4 unavailable');
  const blob = await res.blob();
  return new File([blob], 'test-video.mp4', { type: 'video/mp4' });
}

export async function buildTestPayload(kind: TestPostKind): Promise<TestPayload> {
  switch (kind) {
    case 'text':
      return { text: TEST_TEXT };
    case 'image':
      return { file: await testCardPng(), text: TEST_CAPTION };
    case 'video':
      return { file: await mockVideoFile(), text: TEST_CAPTION };
    case 'audio':
      return { file: toneWav(), text: TEST_CAPTION };
    case 'youtube':
      return { text: TEST_YOUTUBE };
    case 'gif':
      return { giphyId: TEST_GIPHY_ID, text: TEST_CAPTION };
  }
}
