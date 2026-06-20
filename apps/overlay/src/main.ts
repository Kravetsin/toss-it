import '@fontsource/jetbrains-mono';
import { io, type Socket } from 'socket.io-client';
import {
  OVERLAY_POSITIONS,
  positionToFlex,
  type DonationFx,
  type MediaKind,
  type MediaPlayPayload,
  type OverlayPosition,
  type OverlayToServerEvents,
  type ServerToOverlayEvents,
} from '@tmw/shared';

// Minimal YouTube IFrame API types (avoids @types/youtube dependency).
interface YTPlayer {
  setVolume(volume: number): void;
  playVideo(): void;
  getDuration(): number;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}
interface YTPlayerOptions {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { target: YTPlayer; data: number }) => void;
    onError?: (e: { data: number }) => void;
  };
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: YTPlayerOptions) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Inline pixelarticons glyph (no React icon set in the overlay).
const GIFT_SVG =
  '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 6h16v2H4zM2 8h2v4H2zm2 4h16v2H4zm16-4h2v4h-2zM6 4h2v2H6zm2-2h3v2H8zm3 2h2v2h-2zm2-2h3v2h-3zm3 2h2v2h-2zM4 14h2v6H4zm2 6h12v2H6zm12-6h2v6h-2zm-7-6h2v4h-2zm0 6h2v6h-2z"/></svg>';

// Dev: server on separate port. Prod: overlay served by the server (same-origin).
const SERVER_URL = import.meta.env.DEV ? 'http://127.0.0.1:3000' : window.location.origin;

const stage = document.getElementById('stage')!;

// ?demo=1 renders sample media without server/token (look-and-feel check, incl. OBS).
const DEMO = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');

// Auth via channel secret token in URL (?token=...); OAuth impossible in OBS Browser Source.
const token = new URLSearchParams(window.location.search).get('token');
if (!DEMO && !token) {
  stage.innerHTML =
    '<div style="font: 16px system-ui; color: #f55">Нет токена: добавь ?token=&lt;overlay token&gt; к URL</div>';
  throw new Error('overlay token missing');
}

const socket: Socket<ServerToOverlayEvents, OverlayToServerEvents> = DEMO
  ? demoSocketStub()
  : io(SERVER_URL, { query: { role: 'overlay', token: token ?? '' } });

let currentId: string | null = null;
let hideTimer: number | undefined;
let finishing = false;
let ytPlayer: YTPlayer | null = null;
let ytApiPromise: Promise<void> | null = null;
let ytReportedSid: string | null = null;
let exitTimer: number | undefined;

socket.on('connect', () => console.log('[overlay] connected'));
socket.on('media:play', show);
socket.on('media:skip', (submissionId) => {
  if (submissionId === currentId) finish();
});
socket.on('donation:fx', triggerDonationFx);

function show(payload: MediaPlayPayload): void {
  clearStage();
  currentId = payload.submissionId;
  finishing = false;

  const { justify, align } = positionToFlex(payload.position);
  stage.style.justifyContent = justify;
  stage.style.alignItems = align;
  stage.style.padding = `${payload.margin}vh ${payload.margin}vw`;
  stage.style.setProperty('--overlay-size', String(payload.size));

  const url = resolveMediaUrl(payload.url);
  const alert = document.createElement('div');
  alert.className = 'alert enter';
  // Caption ABOVE media so it doesn't shift the player when it disappears.
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

  // Hard cap: leaves screen no later than server-issued durationMs.
  // YouTube uses durationMs=0 (no cap) — finishes on the player's 'ended' event.
  if (payload.durationMs > 0) {
    hideTimer = window.setTimeout(finish, payload.durationMs);
  }
}

function createMediaElement(payload: MediaPlayPayload, url: string): HTMLElement {
  const volume = Math.min(100, Math.max(0, payload.volume ?? 100)) / 100;

  if (payload.kind === 'text') {
    // Text-only: skip /api/media, render a message card.
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
    // OBS allows autoplay with sound; browsers may block it — retry muted.
    video.play().catch(() => {
      video.muted = true;
      void video.play();
    });
    return video;
  }

  if (payload.kind === 'youtube') {
    return createYoutubePlayer(payload);
  }

  // Audio has nothing to show — render a player with progress + time.
  return createMusicWidget(payload, url, volume);
}

/** Music widget: filling progress bar + mm:ss time. */
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
  // payload duration: instant label before the audio reports its own.
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

/** YouTube embedded IFrame player. Plays to the end; duration reported to server. */
function createYoutubePlayer(payload: MediaPlayPayload): HTMLElement {
  const container = document.createElement('div');
  container.className = 'youtube';
  // Explicit 16:9 WITHOUT css aspect-ratio: old OBS CEF builds don't support it and
  // collapse the container to height 0. calc/min work everywhere. Music = capped width.
  const widthExpr = payload.youtubeMusic ? `min(${payload.size}vw, 460px)` : `${payload.size}vw`;
  container.style.width = widthExpr;
  container.style.height = `calc(${widthExpr} * 9 / 16)`;
  container.style.maxWidth = '100%';

  const mount = document.createElement('div');
  container.appendChild(mount);

  const videoId = payload.youtubeId;
  const sid = payload.submissionId;
  if (!videoId) return container;

  void loadYouTubeApi().then(() => {
    // The show may have changed/ended while the YT API loaded — avoid an orphaned
    // player that keeps playing audio after destroyYoutube().
    if (currentId !== sid || finishing || !window.YT) return;
    ytPlayer = new window.YT.Player(mount, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 0,
        rel: 0,
        playsinline: 1,
        modestbranding: 1,
        start: payload.youtubeStartSeconds ?? 0,
      },
      events: {
        onReady: (e) => {
          if (currentId !== sid || finishing) return;
          e.target.setVolume(Math.min(100, Math.max(0, payload.volume)));
          e.target.playVideo();
          const f = e.target.getIframe();
          f.style.width = '100%';
          f.style.height = '100%';
          reportYoutubeDuration(sid, e.target);
        },
        onStateChange: (e) => {
          // Only react to the current show: an old player may emit a late ENDED
          // after we've switched to the next clip.
          if (currentId !== sid || !window.YT) return;
          if (e.data === window.YT.PlayerState.ENDED) finish();
          else if (e.data === window.YT.PlayerState.PLAYING) reportYoutubeDuration(sid, e.target);
        },
        onError: () => {
          // Video won't play (age/region restriction, removed, etc.) — finish now
          // instead of holding an empty frame until the watchdog.
          if (currentId === sid) finish();
        },
      },
    });
  });

  return container;
}

/** Report the clip's real duration to the server, once per show (watchdog + now-playing panel). */
function reportYoutubeDuration(submissionId: string, player: YTPlayer): void {
  if (ytReportedSid === submissionId) return;
  const ms = Math.round(player.getDuration() * 1000);
  if (ms > 0) {
    ytReportedSid = submissionId;
    socket.emit('playback:duration', submissionId, ms);
  }
}

/** Lazily load the YouTube IFrame API (once per overlay session). */
function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve();
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

/** Seconds -> m:ss. */
function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Short chime via Web Audio — avoids bundling a sound file. */
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
    /* sound is non-critical */
  }
}

/**
 * Speak name and/or message sequentially (so they don't overlap).
 * Web Speech API has no voices in OBS — play mp3 from the TTS proxy instead.
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
  // Small delay so speech doesn't overlap the chime.
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

/** Stop and destroy the YouTube player so audio cuts immediately on finish/skip. */
function destroyYoutube(): void {
  if (ytPlayer) {
    try {
      ytPlayer.destroy();
    } catch {
      /* player may not have been created yet */
    }
    ytPlayer = null;
  }
}

function finish(): void {
  if (finishing) return;
  finishing = true;
  destroyYoutube();
  const id = currentId;
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
  // Exit animation, then cleanup and signal the server it can send the next one.
  const alert = stage.querySelector('.alert');
  alert?.classList.remove('enter');
  alert?.classList.add('exit');
  exitTimer = window.setTimeout(() => {
    exitTimer = undefined;
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
  // Cancel a pending exit timer: otherwise a media:play within 300ms of finish()
  // would wipe the already-shown next clip.
  if (exitTimer !== undefined) {
    window.clearTimeout(exitTimer);
    exitTimer = undefined;
  }
  destroyYoutube();
  stage.replaceChildren();
}

// Donation FX: meteor burst on a full-screen canvas over the media. Canvas is
// fixed/inset:0 (outside #stage flex), pointer-events:none, self-removes when done.
// Money never flows through us — this is just a reaction to the event.

const FX_ACCENT = '141,240,204'; // mint accent (rgb)

function triggerDonationFx(fx: DonationFx): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'donation-fx';
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:50';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stage.appendChild(canvas);

  // Intensity scales with amount: bigger donation = denser meteors (capped).
  const amount = Number.isFinite(fx.amount) ? Math.max(0, fx.amount) : 0;
  const meteorCount = Math.round(Math.min(70, 14 + amount * 0.6));
  const DURATION = 2600;

  interface Meteor {
    x: number;
    y: number;
    vx: number;
    vy: number;
    len: number;
    delay: number;
    born: number;
  }
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const meteors: Meteor[] = Array.from({ length: meteorCount }, () => {
    const speed = rand(0.5, 1.05);
    return {
      x: rand(-0.1, 1.1) * W,
      y: rand(-0.3, 0.4) * H,
      vx: speed * rand(0.35, 0.6),
      vy: speed,
      len: rand(60, 150),
      delay: rand(0, DURATION * 0.45),
      born: 0,
    };
  });

  const start = performance.now();
  function frame(now: number): void {
    const t = now - start;
    if (t > DURATION) {
      canvas.remove();
      return;
    }
    ctx!.clearRect(0, 0, W, H);

    // One-shot radial flash from center (fades fast).
    const flash = Math.max(0, 1 - t / 600);
    if (flash > 0.01) {
      const r = Math.max(W, H) * 0.6;
      const g = ctx!.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, r);
      g.addColorStop(0, `rgba(${FX_ACCENT},${(flash * 0.35).toFixed(3)})`);
      g.addColorStop(1, `rgba(${FX_ACCENT},0)`);
      ctx!.fillStyle = g;
      ctx!.fillRect(0, 0, W, H);
    }

    for (const m of meteors) {
      const mt = t - m.delay;
      if (mt < 0) continue;
      const px = m.x + m.vx * mt;
      const py = m.y + m.vy * mt;
      if (py - m.len > H || px - m.len > W) continue;
      // Meteor tail: linear gradient to transparent.
      const tx = px - (m.vx / m.vy) * m.len;
      const ty = py - m.len;
      const grad = ctx!.createLinearGradient(px, py, tx, ty);
      const a = Math.max(0, 1 - mt / DURATION);
      grad.addColorStop(0, `rgba(${FX_ACCENT},${(a * 0.9).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${FX_ACCENT},0)`);
      ctx!.strokeStyle = grad;
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(px, py);
      ctx!.lineTo(tx, ty);
      ctx!.stroke();
      // Meteor head.
      ctx!.fillStyle = `rgba(255,255,255,${(a * 0.9).toFixed(3)})`;
      ctx!.beginPath();
      ctx!.arc(px, py, 1.8, 0, 6.2832);
      ctx!.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// DEV demo (?demo=1): runs sample media through the real overlay render without
// server/token, dev-only. See apps/web/REDESIGN.md §5.4 (overlay track).

/** Don't prefix SERVER_URL onto absolute/data/blob URLs (needed for demo, safe in general). */
function resolveMediaUrl(u: string): string {
  return /^(data:|https?:|blob:)/i.test(u) ? u : SERVER_URL + u;
}

/** Socket stub for demo (no server): on/emit/close are no-ops. */
function demoSocketStub(): Socket<ServerToOverlayEvents, OverlayToServerEvents> {
  const noop = function (this: unknown) {
    return this;
  };
  return {
    on: noop,
    off: noop,
    emit: noop,
    connect: noop,
    disconnect: noop,
    close: () => {},
  } as unknown as Socket<ServerToOverlayEvents, OverlayToServerEvents>;
}

const SAMPLE_IMG = `data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='400'>" +
    "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
    "<stop offset='0' stop-color='#8df0cc'/><stop offset='1' stop-color='#0d1111'/></linearGradient></defs>" +
    "<rect width='640' height='400' fill='url(#g)'/>" +
    "<text x='50%' y='56%' font-family='monospace' font-weight='700' font-size='96' " +
    "text-anchor='middle' fill='#06201a'>DEMO</text></svg>",
)}`;
const SAMPLE_VIDEO = 'https://media.w3.org/2010/05/sintel/trailer.mp4';
const SAMPLE_YT = 'dQw4w9WgXcQ';

/** Short silent WAV (data-URI) so the music widget actually plays/advances offline. */
function makeSilentWavDataUri(seconds: number): string {
  const rate = 8000;
  const samples = Math.floor(rate * seconds);
  const dataLen = samples * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const dv = new DataView(buf);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true);
  dv.setUint32(28, rate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  ascii(36, 'data');
  dv.setUint32(40, dataLen, true);
  let bin = '';
  for (const byte of new Uint8Array(buf)) bin += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(bin)}`;
}

// Lazy WAV generation — skipped in the normal (non-demo) overlay.
let _sampleAudio: string | undefined;
function sampleAudio(): string {
  if (_sampleAudio === undefined) _sampleAudio = makeSilentWavDataUri(12);
  return _sampleAudio;
}

interface DemoState {
  pos: OverlayPosition;
  size: number;
  sender: boolean;
  caption: boolean;
  sound: boolean;
}

function demoPayload(kind: MediaKind, st: DemoState): MediaPlayPayload {
  const base: MediaPlayPayload = {
    submissionId: `demo-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    url: '',
    kind,
    durationMs: 600_000,
    volume: 80,
    sound: st.sound,
    senderName: st.sender ? 'demo_viewer' : undefined,
    tts: false,
    ttsText: false,
    position: st.pos,
    size: st.size,
    margin: 5,
  };
  const cap = st.caption ? 'демо-подпись к медиа' : undefined;
  if (kind === 'text')
    return { ...base, text: 'Тестовое сообщение ✦ как текст смотрится на стриме?' };
  if (kind === 'image') return { ...base, url: SAMPLE_IMG, text: cap };
  if (kind === 'video') return { ...base, url: SAMPLE_VIDEO, text: cap };
  if (kind === 'youtube') return { ...base, youtubeId: SAMPLE_YT, durationMs: 0, text: cap };
  return { ...base, url: sampleAudio(), durationMs: 12_000, text: cap };
}

function mountDemoPanel(): void {
  const st: DemoState = { pos: 'center', size: 60, sender: true, caption: true, sound: false };

  const style = document.createElement('style');
  style.textContent = `
    #demo-panel{position:fixed;left:12px;bottom:12px;z-index:9999;display:flex;flex-direction:column;gap:8px;
      padding:12px;width:236px;background:#0d1111ee;border:1px solid #8df0cc44;border-radius:8px;
      font:12px/1.3 ui-monospace,monospace;color:#ededec;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
    #demo-panel b{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#7a8180}
    #demo-panel .row{display:flex;flex-wrap:wrap;gap:4px}
    #demo-panel button{cursor:pointer;border:1px solid #2b3338;background:#060607;color:#ededec;padding:5px 8px;border-radius:4px;font:inherit}
    #demo-panel button:hover{border-color:#8df0cc;color:#8df0cc}
    #demo-panel .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:3px}
    #demo-panel .grid button{padding:7px 0}
    #demo-panel .grid button.on{border-color:#8df0cc;color:#8df0cc;background:#8df0cc22}
    #demo-panel label{display:flex;align-items:center;gap:5px}
    #demo-panel input[type=range]{width:100%}
    #demo-panel .clear{border-color:#fb5b6e55;color:#fb5b6e}`;
  document.head.appendChild(style);

  const panel = document.createElement('div');
  panel.id = 'demo-panel';

  const section = (title: string) => {
    const b = document.createElement('b');
    b.textContent = title;
    panel.appendChild(b);
  };
  const btn = (label: string, onClick: () => void, cls = '') => {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.onclick = onClick;
    return b;
  };

  section('демо · медиа');
  const mediaRow = document.createElement('div');
  mediaRow.className = 'row';
  (
    [
      ['image', 'Картинка'],
      ['video', 'Видео'],
      ['text', 'Текст'],
      ['youtube', 'YouTube'],
      ['audio', 'Музыка'],
    ] as [MediaKind, string][]
  ).forEach(([k, label]) => mediaRow.appendChild(btn(label, () => show(demoPayload(k, st)))));
  panel.appendChild(mediaRow);

  section('позиция');
  const grid = document.createElement('div');
  grid.className = 'grid';
  const posButtons = OVERLAY_POSITIONS.map((p) => {
    const b = btn('•', () => {
      st.pos = p;
      posButtons.forEach((x) => x.classList.toggle('on', x === b));
    });
    if (p === st.pos) b.classList.add('on');
    grid.appendChild(b);
    return b;
  });
  panel.appendChild(grid);

  section('размер');
  const size = document.createElement('input');
  size.type = 'range';
  size.min = '10';
  size.max = '100';
  size.value = String(st.size);
  size.oninput = () => {
    st.size = Number(size.value);
  };
  panel.appendChild(size);

  const toggles = document.createElement('div');
  toggles.className = 'row';
  const toggle = (label: string, key: 'sender' | 'caption' | 'sound') => {
    const wrap = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = st[key];
    cb.onchange = () => {
      st[key] = cb.checked;
    };
    wrap.append(cb, document.createTextNode(label));
    return wrap;
  };
  toggles.append(toggle('имя', 'sender'), toggle('подпись', 'caption'), toggle('звук', 'sound'));
  panel.appendChild(toggles);

  section('донат');
  panel.appendChild(
    btn('Всплеск (донат)', () =>
      triggerDonationFx({
        provider: 'test',
        donorName: 'demo_viewer',
        amount: 50,
        currency: 'UAH',
        message: 'тест',
      }),
    ),
  );

  panel.appendChild(btn('Убрать с экрана', () => finish(), 'clear'));

  document.body.appendChild(panel);
}

if (DEMO) mountDemoPanel();
