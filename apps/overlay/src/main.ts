import { io, type Socket } from 'socket.io-client';
import type {
  MediaPlayPayload,
  OverlayToServerEvents,
  ServerToOverlayEvents,
} from '@tmw/shared';

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

socket.on('connect', () => console.log('[overlay] connected'));
socket.on('media:play', show);
socket.on('media:skip', (submissionId) => {
  if (submissionId === currentId) finish();
});

function show(payload: MediaPlayPayload): void {
  clearStage();
  currentId = payload.submissionId;

  const url = SERVER_URL + payload.url;
  const el = createMediaElement(payload, url);
  stage.appendChild(el);

  // Жёсткий таймер: что бы файл ни «думал» о своей длительности,
  // с экрана он уйдёт не позже durationMs, выданного сервером.
  hideTimer = window.setTimeout(finish, payload.durationMs);
}

function createMediaElement(payload: MediaPlayPayload, url: string): HTMLElement {
  const style = 'max-width: 80vw; max-height: 80vh;';

  if (payload.kind === 'image') {
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = style;
    return img;
  }

  if (payload.kind === 'video') {
    const video = document.createElement('video');
    video.src = url;
    video.autoplay = true;
    video.style.cssText = style;
    video.addEventListener('ended', finish);
    // В OBS autoplay со звуком разрешён; в обычном браузере политика
    // может его заблокировать — тогда повторяем без звука.
    video.play().catch(() => {
      video.muted = true;
      void video.play();
    });
    return video;
  }

  // Аудио: самого медиа не видно, показываем имя отправителя.
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'font: bold 28px system-ui, sans-serif; color: #fff; text-shadow: 0 1px 4px #000a;';
  wrap.textContent = `🎵 ${payload.senderName ?? 'аноним'}`;
  const audio = document.createElement('audio');
  audio.src = url;
  audio.autoplay = true;
  audio.addEventListener('ended', finish);
  audio.play().catch(() => console.warn('[overlay] audio autoplay blocked'));
  wrap.appendChild(audio);
  return wrap;
}

function finish(): void {
  const id = currentId;
  clearStage();
  currentId = null;
  if (id) socket.emit('playback:done', id);
}

function clearStage(): void {
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
  stage.replaceChildren();
}
