import '@fontsource/pixelify-sans';
import { io, type Socket } from 'socket.io-client';
import {
  positionToFlex,
  type MediaPlayPayload,
  type OverlayToServerEvents,
  type ServerToOverlayEvents,
} from '@tmw/shared';

// Pixelarticons glyphs (inline, без зависимости от React-набора в оверлее).
const GIFT_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 6h16v2H4zM2 8h2v4H2zm2 4h16v2H4zm16-4h2v4h-2zM6 4h2v2H6zm2-2h3v2H8zm3 2h2v2h-2zm2-2h3v2h-3zm3 2h2v2h-2zM4 14h2v6H4zm2 6h12v2H6zm12-6h2v6h-2zm-7-6h2v4h-2zm0 6h2v6h-2z"/></svg>';

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

  // Раскладка из настроек канала: якорь (flex-выравнивание), отступ от края и размер.
  const { justify, align } = positionToFlex(payload.position);
  stage.style.justifyContent = justify;
  stage.style.alignItems = align;
  stage.style.padding = `${payload.margin}vh ${payload.margin}vw`;
  stage.style.setProperty('--overlay-size', String(payload.size));

  const url = SERVER_URL + payload.url;
  const alert = document.createElement('div');
  alert.className = 'alert enter';
  // Подпись — НАД медиа: так при её исчезновении плеер/медиа не «прыгают».
  // (Для текста-онли сам контент уже в карточке.)
  if (payload.text && payload.kind !== 'text') {
    const cap = document.createElement('div');
    cap.className = 'caption';
    cap.textContent = payload.text;
    alert.appendChild(cap);
  }
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
  scheduleSpeech(payload);

  // Жёсткий таймер: что бы файл ни «думал» о своей длительности,
  // с экрана он уйдёт не позже durationMs, выданного сервером.
  hideTimer = window.setTimeout(finish, payload.durationMs);
}

function createMediaElement(payload: MediaPlayPayload, url: string): HTMLElement {
  const volume = Math.min(100, Math.max(0, payload.volume ?? 100)) / 100;

  if (payload.kind === 'text') {
    // Текст-онли: к /api/media не обращаемся, рисуем карточку-сообщение.
    const card = document.createElement('div');
    card.className = 'text-card';
    card.textContent = payload.text ?? '';
    return card;
  }

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

  // Аудио: самого медиа не видно — рисуем плеер с эквалайзером, прогрессом и временем.
  return createMusicWidget(payload, url, volume);
}

/** Музыкальный виджет: заполняющийся прогресс-бар + время mm:ss. */
function createMusicWidget(payload: MediaPlayPayload, url: string, volume: number): HTMLElement {
  const widget = document.createElement('div');
  widget.className = 'music';

  const progress = document.createElement('div');
  progress.className = 'progress';
  const fill = document.createElement('div');
  fill.className = 'fill';
  progress.appendChild(fill);

  const time = document.createElement('div');
  time.className = 'time';
  const cur = document.createElement('span');
  const dur = document.createElement('span');
  cur.textContent = '0:00';
  // Длительность из payload — мгновенная подпись до того, как audio узнает свою.
  dur.textContent = formatTime(payload.durationMs / 1000);
  time.append(cur, dur);

  const audio = document.createElement('audio');
  audio.src = url;
  audio.autoplay = true;
  audio.volume = volume;
  audio.addEventListener('ended', finish);

  const totalSec = () =>
    Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : payload.durationMs / 1000;
  audio.addEventListener('loadedmetadata', () => {
    dur.textContent = formatTime(totalSec());
  });
  audio.addEventListener('timeupdate', () => {
    const total = totalSec();
    fill.style.width = `${Math.min(100, (audio.currentTime / total) * 100)}%`;
    cur.textContent = formatTime(audio.currentTime);
  });
  audio.play().catch(() => console.warn('[overlay] audio autoplay blocked'));

  widget.append(progress, time, audio);
  return widget;
}

/** Секунды → m:ss. */
function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
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
 * Озвучка имени и/или текста сообщения по очереди (чтобы не накладывались).
 * Web Speech API в OBS не работает (нет голосов) — проигрываем mp3 от TTS-прокси.
 */
function scheduleSpeech(payload: MediaPlayPayload): void {
  const parts: ('name' | 'message')[] = [];
  if (payload.tts) parts.push('name');
  if (payload.ttsText) parts.push('message');
  if (parts.length === 0) return;

  let i = 0;
  const next = () => {
    const part = parts[i++];
    if (!part) return;
    speak(payload.submissionId, part, payload.volume, next);
  };
  // Тот же небольшой сдвиг, что и раньше, — чтобы не наложиться на «динь».
  window.setTimeout(next, 280);
}

function speak(
  submissionId: string,
  part: 'name' | 'message',
  volume: number,
  onEnd: () => void,
): void {
  try {
    const audio = new Audio(`${SERVER_URL}/api/tts/${submissionId}?part=${part}`);
    audio.volume = Math.min(100, Math.max(0, volume)) / 100;
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onEnd);
    void audio.play().catch(onEnd);
  } catch {
    onEnd();
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
