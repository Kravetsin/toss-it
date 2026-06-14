import '@fontsource/pixelify-sans';
import { io, type Socket } from 'socket.io-client';
import type {
  MediaPlayPayload,
  OverlayToServerEvents,
  ServerToOverlayEvents,
} from '@tmw/shared';

// Pixelarticons glyphs (inline, без зависимости от React-набора в оверлее).
const GIFT_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 6h16v2H4zM2 8h2v4H2zm2 4h16v2H4zm16-4h2v4h-2zM6 4h2v2H6zm2-2h3v2H8zm3 2h2v2h-2zm2-2h3v2h-3zm3 2h2v2h-2zM4 14h2v6H4zm2 6h12v2H6zm12-6h2v6h-2zm-7-6h2v4h-2zm0 6h2v6h-2z"/></svg>';
const VOLUME_SVG =
  '<svg viewBox="0 0 24 24" width="96" height="96" fill="currentColor"><path d="M13 22h-2v-2H9v-2h2V6H9V4h2V2h2v20Zm-4-4H7v-2h2v2Zm10 0h-4v-2h4v2ZM7 10H5v4h2v2H3V8h4v2Zm14 6h-2V8h2v8Zm-4-2h-2v-4h2v4ZM9 8H7V6h2v2Zm10 0h-4V6h4v2Z"/></svg>';

// В dev сервер на отдельном порту; в проде оверлей раздаётся самим сервером (same-origin).
const SERVER_URL = import.meta.env.DEV ? 'http://127.0.0.1:3000' : window.location.origin;

const stage = document.getElementById('stage')!;

// Аутентификация секретным токеном канала из URL: /?token=...
// (OAuth в OBS Browser Source невозможен.)
const token = new URLSearchParams(window.location.search).get('token');
if (!token) {
  stage.innerHTML =
    '<div style="font: 16px system-ui; color: #f55">Нет токена: добавь ?token=&lt;overlay token&gt; к URL</div>';
  throw new Error('overlay token missing');
}

const socket: Socket<ServerToOverlayEvents, OverlayToServerEvents> = io(SERVER_URL, {
  query: { role: 'overlay', token },
});

let currentId: string | null = null;
let hideTimer: number | undefined;
let finishing = false;

socket.on('connect', () => console.log('[overlay] connected'));
socket.on('media:play', show);
socket.on('media:skip', (submissionId) => {
  if (submissionId === currentId) finish();
});

function show(payload: MediaPlayPayload): void {
  clearStage();
  currentId = payload.submissionId;
  finishing = false;

  const url = SERVER_URL + payload.url;
  const alert = document.createElement('div');
  alert.className = 'alert enter';
  alert.appendChild(createMediaElement(payload, url));
  if (payload.senderName) {
    const banner = document.createElement('div');
    banner.className = 'sender';
    banner.innerHTML = `<span class="glyph">${GIFT_SVG}</span>`;
    banner.appendChild(document.createTextNode(payload.senderName));
    alert.appendChild(banner);
  }
  stage.appendChild(alert);

  if (payload.sound) playChime(payload.volume);
  // Озвучку имени даём чуть позже, чтобы не наложилась на «динь».
  if (payload.tts) window.setTimeout(() => speakName(payload.submissionId, payload.volume), 280);

  // Жёсткий таймер: что бы файл ни «думал» о своей длительности,
  // с экрана он уйдёт не позже durationMs, выданного сервером.
  hideTimer = window.setTimeout(finish, payload.durationMs);
}

function createMediaElement(payload: MediaPlayPayload, url: string): HTMLElement {
  const volume = Math.min(100, Math.max(0, payload.volume ?? 100)) / 100;

  if (payload.kind === 'image') {
    const img = document.createElement('img');
    img.src = url;
    return img;
  }

  if (payload.kind === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.autoplay = true;
    video.volume = volume;
    video.addEventListener('ended', finish);
    // В OBS autoplay со звуком разрешён; в обычном браузере политика
    // может его заблокировать — тогда повторяем без звука.
    video.play().catch(() => {
      video.muted = true;
      void video.play();
    });
    return video;
  }

  // Аудио: самого медиа не видно, показываем пиксельную иконку звука.
  const icon = document.createElement('div');
  icon.className = 'audio-icon';
  icon.innerHTML = VOLUME_SVG;
  const audio = document.createElement('audio');
  audio.src = url;
  audio.autoplay = true;
  audio.volume = volume;
  audio.addEventListener('ended', finish);
  audio.play().catch(() => console.warn('[overlay] audio autoplay blocked'));
  icon.appendChild(audio);
  return icon;
}

/** Короткий приятный «динь» через Web Audio — без бандла звукового файла. */
function playChime(volume: number): void {
  try {
    const Ctx = window.AudioContext;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.gain.value = (Math.min(100, Math.max(0, volume)) / 100) * 0.2;
    gain.connect(ctx.destination);
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      const start = ctx.currentTime + i * 0.12;
      osc.start(start);
      osc.stop(start + 0.12);
    });
    setTimeout(() => void ctx.close(), 600);
  } catch {
    /* звук не критичен */
  }
}

/**
 * Озвучка имени отправителя. Web Speech API в OBS не работает (нет голосов),
 * поэтому проигрываем готовый mp3 от серверного TTS-прокси как обычное аудио.
 */
function speakName(submissionId: string, volume: number): void {
  try {
    const audio = new Audio(`${SERVER_URL}/api/tts/${submissionId}`);
    audio.volume = Math.min(100, Math.max(0, volume)) / 100;
    void audio.play().catch(() => {
      /* автоплей мог быть заблокирован вне OBS */
    });
  } catch {
    /* TTS не критичен */
  }
}

function finish(): void {
  if (finishing) return;
  finishing = true;
  const id = currentId;
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
  // Анимация ухода, затем чистка и сигнал серверу «можно следующий».
  const alert = stage.querySelector('.alert');
  alert?.classList.remove('enter');
  alert?.classList.add('exit');
  window.setTimeout(() => {
    stage.replaceChildren();
    currentId = null;
    if (id) socket.emit('playback:done', id);
  }, 300);
}

function clearStage(): void {
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
  stage.replaceChildren();
}
