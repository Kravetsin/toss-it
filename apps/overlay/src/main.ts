import '@fontsource/jetbrains-mono';
// The stage's looks, next to the code that builds it (see the note in chat.ts).
import './overlay-base.css';
import './alert.css';
import { io, type Socket } from 'socket.io-client';
import {
  COSMETICS,
  LEVEL_GLOW_FROM,
  OVERLAY_POSITIONS,
  applyEntrance,
  applyStyleMap,
  giphyGifUrl,
  injectCosmeticsStyles,
  injectLevelStyles,
  levelTier,
  mountCardEffect,
  nickRender,
  positionToFlex,
  toRoman,
  youtubePlaylistId,
  type DonationFx,
  type MediaKind,
  type MediaPlayPayload,
  type MusicCommand,
  type MusicConfig,
  type OverlayPosition,
  type OverlayToServerEvents,
  type ServerToOverlayEvents,
} from '@tmw/shared';

// Cosmetic effect CSS is injected from the shared registry (single source across web + overlay).
injectCosmeticsStyles();
injectLevelStyles();

// Minimal YouTube IFrame API types (avoids @types/youtube dependency).
interface YTPlayer {
  setVolume(volume: number): void;
  playVideo(): void;
  pauseVideo(): void;
  nextVideo(): void;
  previousVideo(): void;
  playVideoAt(index: number): void;
  loadVideoById(videoId: string, startSeconds?: number): void;
  setShuffle(shuffle: boolean): void;
  getPlaylist(): string[] | null;
  getPlaylistIndex(): number;
  getDuration(): number;
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}
interface YTPlayerOptions {
  /** Omitted for playlist mode (list via playerVars). */
  videoId?: string;
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
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Inline lucide-style glyphs (no React icon set in the overlay; stroke = 2, matches the web).
const GIFT_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/></svg>';

// Badge id -> inline SVG, rendered in mint after the name. Founder = sparkles (matches web UserBadges).
const BADGE_SVG: Record<string, string> = {
  founder:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M6 18H2"/></svg>',
};

// Dev: server on separate port. Prod: overlay served by the server (same-origin).
const SERVER_URL = import.meta.env.DEV ? 'http://127.0.0.1:3000' : window.location.origin;

const stage = document.getElementById('stage')!;

// A viewer's cosmetic must not override someone's accessibility setting, so an equipped entrance is
// simply not applied here (the stage's own pop-in predates this and is untouched).
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
// Playback controls: pause state + progress reporting for the dashboard's now-playing bar.
let paused = false;
let currentKind: MediaKind | null = null;
let mediaEl: HTMLVideoElement | HTMLAudioElement | null = null;
// Image/gif/text have no player — we track their fixed display window ourselves so it can be frozen.
let timedDurationMs = 0;
let timedElapsedMs = 0;
let timedStartTs = 0;
let progressTimer: number | undefined;

socket.on('connect', () => console.log('[overlay] connected'));
socket.on('media:play', show);
socket.on('media:skip', (submissionId) => {
  if (submissionId === currentId) finish();
});
socket.on('media:control', (action) => {
  if (!currentId) return;
  if (action === 'pause') pausePlayback();
  else resumePlayback();
});
socket.on('media:volume', (volume) => {
  if (!currentId) return;
  const v = Math.min(100, Math.max(0, volume));
  // video + audio (incl. the music widget's <audio>) go through mediaEl; YouTube via its player.
  if (mediaEl) mediaEl.volume = v / 100;
  else if (currentKind === 'youtube') ytPlayer?.setVolume(v);
});
socket.on('media:seek', (seconds) => {
  if (!currentId) return;
  const s = Math.max(0, seconds);
  // Only media with a real timeline; image/gif/text run on a fixed hide timer (not seekable).
  if (mediaEl) mediaEl.currentTime = s;
  else if (currentKind === 'youtube') ytPlayer?.seekTo(s, true);
});
socket.on('donation:fx', triggerDonationFx);
// The server sends chat:config to both overlays; this one used to drop it on the floor. It takes
// exactly one field: the rank numeral appears here too, so the switch that hides it must reach here
// too. Everything else in that config is the chat's own business.
socket.on('chat:config', (cfg) => {
  document.documentElement.dataset.level = cfg.showLevel === false ? 'off' : 'on';
});
socket.on('music:config', applyMusicConfig);
socket.on('music:command', handleMusicCommand);

function show(payload: MediaPlayPayload): void {
  clearStage();
  currentId = payload.submissionId;
  finishing = false;
  paused = false;
  currentKind = payload.kind;
  suspendMusic(true); // post on screen → fade out, pause and hide the background music

  const { justify, align } = positionToFlex(payload.position);
  stage.style.justifyContent = justify;
  stage.style.alignItems = align;
  stage.style.padding = `${payload.margin}vh ${payload.margin}vw`;
  stage.style.setProperty('--overlay-size', String(payload.size));

  const url = resolveMediaUrl(payload.url);
  const alert = document.createElement('div');
  alert.className = 'alert enter';
  // The alert IS the thing arriving, so it wears the entrance itself. Unequipped leaves the stage's
  // own pop-in running (see .alert.enter:not([data-fx]) in index.html).
  applyEntrance(alert, payload.senderEntrance, reduceMotion);

  const media = createMediaElement(payload, url);
  // Music (uploaded audio + a YouTube *song* request) renders as one compact player card: media on
  // top, then a single meta row — sender + caption as a marquee — instead of three stacked cards.
  // The two used to look unrelated (a thin bar widget vs a bare video box); this gives them one frame.
  const isMusic =
    payload.kind === 'audio' || (payload.kind === 'youtube' && !!payload.youtubeMusic);
  if (isMusic) {
    const player = document.createElement('div');
    player.className = payload.kind === 'youtube' ? 'player is-youtube' : 'player';
    const mediaBox = document.createElement('div');
    mediaBox.className = 'player-media';
    mediaBox.appendChild(media);
    player.appendChild(mediaBox);
    if (payload.senderName || payload.text) {
      const meta = document.createElement('div');
      meta.className = 'player-meta';
      if (payload.senderName) decorateSender(meta, payload);
      if (payload.text) {
        if (payload.senderName) {
          const sep = document.createElement('span');
          sep.className = 'meta-sep';
          sep.textContent = '·';
          meta.appendChild(sep);
        }
        // Caption viewport clips; the inner track scrolls (ping-pong) only when it overflows.
        const cap = document.createElement('span');
        cap.className = 'player-caption';
        const track = document.createElement('span');
        track.className = 'marq-track';
        track.textContent = payload.text;
        cap.appendChild(track);
        meta.appendChild(cap);
        applyMarquee(cap, track);
      }
      player.appendChild(meta);
    }
    alert.appendChild(player);
  } else {
    // Caption ABOVE media so it doesn't shift the player when it disappears.
    if (payload.text && payload.kind !== 'text') {
      const cap = document.createElement('div');
      cap.className = 'caption';
      cap.textContent = payload.text;
      alert.appendChild(cap);
    }
    alert.appendChild(media);
    if (payload.senderName) {
      const banner = document.createElement('div');
      banner.className = 'sender';
      decorateSender(banner, payload);
      alert.appendChild(banner);
    }
  }
  stage.appendChild(alert);

  if (payload.sound) playChime(payload.volume);
  scheduleSpeech(payload);

  // Hard cap: leaves screen no later than server-issued durationMs.
  // YouTube uses durationMs=0 (no cap) — finishes on the player's 'ended' event.
  if (payload.durationMs > 0) {
    hideTimer = window.setTimeout(finish, payload.durationMs);
  }

  // Progress/pause plumbing. video/audio play through a media element; image/gif/text run on the
  // hide timer above, whose window we mirror here so pause can freeze it.
  mediaEl = alert.querySelector<HTMLVideoElement | HTMLAudioElement>('video, audio');
  if (!mediaEl && payload.durationMs > 0) {
    timedDurationMs = payload.durationMs;
    timedElapsedMs = 0;
    timedStartTs = Date.now();
  }
  progressTimer = window.setInterval(emitProgress, 350);
}

/**
 * Fill a sender container — the `.sender` banner (image/video) or the music player's `.player-meta`
 * footer — with the gift glyph, level rail + numeral, the cosmetic-tinted name, and badges. Shared
 * so both surfaces stay identical. The card effect belongs to the sender, so it plays here, on the
 * short name row, not over the media the viewer sent.
 */
function decorateSender(el: HTMLElement, payload: MediaPlayPayload): void {
  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.innerHTML = GIFT_SVG;
  el.appendChild(glyph);
  // Level: rarity rail on the left edge + Roman numeral rank before the name (glow from lvl 6).
  const tier = payload.senderLevel ? levelTier(payload.senderLevel) : null;
  if (tier) {
    el.classList.add('has-level');
    if (tier.iris) el.dataset.iris = ''; // Eternal (10): iridescent shimmer on rail + numeral.
    el.style.setProperty('--tier', tier.color);
    el.style.setProperty(
      '--tier-glow',
      payload.senderLevel! >= LEVEL_GLOW_FROM ? tier.color : 'transparent',
    );
    const ln = document.createElement('span');
    ln.className = 'lvl-num';
    ln.textContent = toRoman(payload.senderLevel!);
    el.appendChild(ln);
  }
  // Wrap the name so an equipped nick color tints only the name, not the glyph/badges.
  const nameEl = document.createElement('span');
  nameEl.className = 'name';
  nameEl.textContent = payload.senderName ?? '';
  const nick = nickRender({
    color: payload.senderColor ?? null,
    color2: payload.senderColor2 ?? null,
    flow: payload.senderNickFlow ?? false,
    effect: payload.senderEffect ?? null,
  });
  // split(): nickRender composes several classes (paint + flow + effect) and classList.add throws
  // on a string containing spaces.
  if (nick.className) nameEl.classList.add(...nick.className.split(' '));
  applyStyleMap(nameEl, nick.style);
  el.appendChild(nameEl);
  // Badges (founder, future cosmetics) — mint glyphs after the name.
  const badgeSvgs = (payload.senderBadges ?? [])
    .map((id) => BADGE_SVG[id])
    .filter((svg): svg is string => Boolean(svg));
  if (badgeSvgs.length) {
    const badges = document.createElement('span');
    badges.className = 'badges';
    badges.innerHTML = badgeSvgs.map((svg) => `<span class="badge">${svg}</span>`).join('');
    el.appendChild(badges);
  }
  if (payload.senderCardEffect) mountCardEffect(el, payload.senderCardEffect, 'overlayCard', true);
}

/** Scroll long caption text horizontally (ping-pong) inside the player meta row, only when it
 *  actually overflows — short captions stay put. Measured after layout via rAF. */
function applyMarquee(viewport: HTMLElement, track: HTMLElement): void {
  requestAnimationFrame(() => {
    const overflow = track.scrollWidth - viewport.clientWidth;
    if (overflow <= 4 || reduceMotion) return;
    track.style.setProperty('--marq', `${overflow}px`);
    const dur = Math.max(5, overflow / 40); // ~40px/s
    track.style.animation = `overlay-marquee ${dur.toFixed(1)}s linear 1s infinite alternate`;
  });
}

/** Report the current show's position to the server (relayed to the dashboard). */
function emitProgress(): void {
  if (!currentId) return;
  let positionMs = 0;
  let durationMs = 0;
  if (mediaEl) {
    positionMs = Math.round(mediaEl.currentTime * 1000);
    durationMs =
      Number.isFinite(mediaEl.duration) && mediaEl.duration > 0
        ? Math.round(mediaEl.duration * 1000)
        : 0;
  } else if (currentKind === 'youtube' && ytPlayer) {
    try {
      positionMs = Math.round(ytPlayer.getCurrentTime() * 1000);
      durationMs = Math.round(ytPlayer.getDuration() * 1000);
    } catch {
      /* player not ready yet */
    }
  } else if (timedDurationMs > 0) {
    positionMs = timedElapsedMs + (paused ? 0 : Date.now() - timedStartTs);
    durationMs = timedDurationMs;
  }
  socket.emit('playback:progress', { submissionId: currentId, positionMs, durationMs, paused });
}

function pausePlayback(): void {
  if (paused || !currentId) return;
  paused = true;
  if (mediaEl) mediaEl.pause();
  else if (currentKind === 'youtube') ytPlayer?.pauseVideo();
  else if (timedDurationMs > 0 && hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
    timedElapsedMs += Date.now() - timedStartTs; // bank the elapsed slice
  }
  emitProgress();
}

function resumePlayback(): void {
  if (!paused || !currentId) return;
  paused = false;
  if (mediaEl) void mediaEl.play().catch(() => {});
  else if (currentKind === 'youtube') ytPlayer?.playVideo();
  else if (timedDurationMs > 0) {
    timedStartTs = Date.now();
    hideTimer = window.setTimeout(finish, Math.max(0, timedDurationMs - timedElapsedMs));
  }
  emitProgress();
}

/** Stop and reset the progress/pause plumbing (on finish or a new show). */
function stopProgress(): void {
  if (progressTimer !== undefined) {
    window.clearInterval(progressTimer);
    progressTimer = undefined;
  }
  paused = false;
  mediaEl = null;
  currentKind = null;
  timedDurationMs = 0;
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

  if (payload.kind === 'gif') {
    // No stored file: render the looping GIF straight from Giphy's CDN.
    const img = document.createElement('img');
    if (payload.giphyId) img.src = giphyGifUrl(payload.giphyId);
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
  if (payload.youtubeMusic) {
    // A song request lives inside the unified `.player` card: fill its 16:9 ratio box (which handles
    // the sizing the old-OBS-safe way, see .player.is-youtube .player-media in alert.css).
    container.style.position = 'absolute';
    container.style.inset = '0';
    container.style.width = '100%';
    container.style.height = '100%';
  } else {
    // Explicit 16:9 WITHOUT css aspect-ratio: old OBS CEF builds don't support it and
    // collapse the container to height 0. calc/min work everywhere.
    const widthExpr = `${payload.size}vw`;
    container.style.width = widthExpr;
    container.style.height = `calc(${widthExpr} * 9 / 16)`;
    container.style.maxWidth = '100%';
  }

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

// ── Background music ────────────────────────────────────────────────────────
// A second YouTube player plays music between posts. While ANY post is on screen it fades to
// silence, pauses, and hides itself (the visible pause also tells the streamer a post arrived, even
// with no sound alert); it fades back up when the screen clears. Can be hidden in OBS (audio-only)
// via settings. Config arrives via 'music:config'.
//
// The owned track list ("list" mode) keeps the queue HERE, not inside the YT player: the player
// only ever loads the current video, and next/prev/shuffle/auto-advance run off musicIds. That
// way list edits (reorder/add/delete) just swap the array and NEVER touch playback — no reload,
// no micro-freeze. The playlistId fallback ("playlist" mode) still uses YT's native playlist.
let musicPlayer: YTPlayer | null = null;
// The container div; the mount we pass to YT.Player gets REPLACED by an iframe (inside this wrap),
// so we keep the wrap reference rather than reaching through the now-detached mount.
let musicWrap: HTMLElement | null = null;
let musicMode: 'list' | 'playlist' | null = null;
let musicIds: string[] = []; // the owned queue (list mode); edits apply instantly
let musicCurrentId: string | null = null; // playing track in list mode
let musicHistory: string[] = []; // recently played stack, so prev works under shuffle
let musicPlaylistId: string | null = null; // fallback source (playlist mode)
let musicShuffle = false;
let musicVolume = 50;
let musicHidden = false;
let musicSuspended = false; // a post is on screen → music faded out + paused + hidden
let musicAppliedVol = 0; // last volume we pushed to the player (YT has no getVolume in our typings)
let musicFadeTimer: number | undefined; // in-flight volume fade, if any
let musicEpoch = 0; // bumped on teardown to invalidate in-flight async player creation

function currentMusicVideoId(): string | null {
  if (musicMode === 'list') return musicCurrentId;
  const list = musicPlayer?.getPlaylist() ?? null;
  const idx = musicPlayer?.getPlaylistIndex() ?? -1;
  return list && idx >= 0 ? (list[idx] ?? null) : null;
}

/** Load + play a track in list mode; the queue itself stays external to the player. */
function playMusicId(id: string, startSeconds = 0): void {
  musicCurrentId = id;
  musicPlayer?.loadVideoById(id, startSeconds);
}

/** Step the list-mode queue (dir=1 is also the auto-advance on track end). */
function stepMusic(dir: 1 | -1): void {
  if (musicMode !== 'list' || musicIds.length === 0) return;
  if (dir === -1 && musicShuffle && musicHistory.length > 0) {
    playMusicId(musicHistory.pop()!);
    return;
  }
  const idx = musicCurrentId ? musicIds.indexOf(musicCurrentId) : -1;
  let next: string;
  if (musicShuffle && musicIds.length > 1) {
    do {
      next = musicIds[Math.floor(Math.random() * musicIds.length)]!;
    } while (next === musicCurrentId);
  } else {
    next = musicIds[(idx + dir + musicIds.length) % musicIds.length]!;
  }
  if (dir === 1 && musicCurrentId) {
    musicHistory.push(musicCurrentId);
    if (musicHistory.length > 50) musicHistory.shift();
  }
  playMusicId(next);
}

/** Target volume: the set level, or 0 while a post is on screen. */
function effectiveMusicVolume(): number {
  return musicSuspended ? 0 : musicVolume;
}

/** Push a volume to the player and remember it (so fades know where they start). The try/catch
 *  guards a player whose API methods aren't attached yet (before onReady). */
function setMusicVol(v: number): void {
  musicAppliedVol = v;
  try {
    musicPlayer?.setVolume(v);
  } catch {
    /* player not ready */
  }
}

/** Ramp the music volume from its current value to `target` over `ms`, then run `onDone`. */
function fadeMusic(target: number, ms: number, onDone?: () => void): void {
  if (musicFadeTimer !== undefined) {
    window.clearInterval(musicFadeTimer);
    musicFadeTimer = undefined;
  }
  const from = musicAppliedVol;
  if (!musicPlayer || from === target) {
    if (musicPlayer) setMusicVol(target);
    onDone?.();
    return;
  }
  const steps = Math.max(1, Math.round(ms / 50));
  let i = 0;
  musicFadeTimer = window.setInterval(() => {
    i += 1;
    setMusicVol(Math.round(from + (target - from) * (i / steps)));
    if (i >= steps) {
      window.clearInterval(musicFadeTimer);
      musicFadeTimer = undefined;
      onDone?.();
    }
  }, 50);
}

const MUSIC_FADE_MS = 1000;
let musicHideTimer: number | undefined;

/** Around a post: fade the music out (≈1s) then pause + hide; on the way back, reveal + resume with
 *  a fade-up. Fades instead of hard-cutting so it doesn't feel abrupt. Visibility is driven on a
 *  timer, NOT off the fade's completion, so it never strands (a post can arrive before the player's
 *  API is ready). Player transport calls are best-effort (guarded). */
function suspendMusic(suspend: boolean): void {
  if (musicSuspended === suspend) return;
  musicSuspended = suspend;
  if (musicHideTimer !== undefined) {
    window.clearTimeout(musicHideTimer);
    musicHideTimer = undefined;
  }
  if (suspend) {
    fadeMusic(0, MUSIC_FADE_MS);
    // Pause + hide once faded. Re-check musicSuspended: the screen may have cleared mid-fade.
    musicHideTimer = window.setTimeout(() => {
      musicHideTimer = undefined;
      if (!musicSuspended) return;
      try {
        musicPlayer?.pauseVideo();
      } catch {
        /* player not ready */
      }
      updateMusicVisibility();
    }, MUSIC_FADE_MS);
  } else {
    updateMusicVisibility(); // reveal before the fade-up (the OBS hide setting still wins)
    try {
      musicPlayer?.playVideo();
    } catch {
      /* player not ready */
    }
    setMusicVol(0);
    fadeMusic(musicVolume, MUSIC_FADE_MS);
  }
}

/** Transport commands from the dashboard. playAt matches by id so it survives shuffle. */
function handleMusicCommand(cmd: MusicCommand): void {
  if (!musicPlayer) return;
  switch (cmd.action) {
    case 'play':
      musicPlayer.playVideo();
      break;
    case 'pause':
      musicPlayer.pauseVideo();
      break;
    case 'next':
      if (musicMode === 'list') stepMusic(1);
      else musicPlayer.nextVideo();
      break;
    case 'prev':
      if (musicMode === 'list') stepMusic(-1);
      else musicPlayer.previousVideo();
      break;
    case 'playAt': {
      if (!cmd.videoId) break;
      if (musicMode === 'list') {
        if (musicIds.includes(cmd.videoId)) playMusicId(cmd.videoId);
      } else {
        const idx = (musicPlayer.getPlaylist() ?? []).indexOf(cmd.videoId);
        if (idx >= 0) musicPlayer.playVideoAt(idx);
      }
      break;
    }
    case 'seek':
      if (typeof cmd.seconds === 'number') musicPlayer.seekTo(cmd.seconds, true);
      break;
  }
}

/** Report track + playing state + position to the server (relayed to the dashboard). */
function reportMusicState(playing: boolean): void {
  socket.emit('music:state', {
    videoId: currentMusicVideoId(),
    playing,
    positionSec: musicPlayer?.getCurrentTime() ?? 0,
    durationSec: musicPlayer?.getDuration() ?? 0,
  });
}

// While playing, report position once a second so the dashboard progress bar advances.
let musicTicker: ReturnType<typeof setInterval> | null = null;
function setMusicTicker(on: boolean): void {
  if (musicTicker) {
    clearInterval(musicTicker);
    musicTicker = null;
  }
  if (on) musicTicker = setInterval(() => reportMusicState(true), 1000);
}

function applyMusicConfig(cfg: MusicConfig): void {
  musicVolume = Math.min(100, Math.max(0, Math.round(cfg.volume)));
  musicHidden = !!cfg.hidden;
  musicShuffle = !!cfg.shuffle;
  if (!musicFadeTimer) setMusicVol(effectiveMusicVolume()); // don't fight an in-flight fade
  const mode = cfg.trackIds.length > 0 ? 'list' : cfg.playlistId ? 'playlist' : null;

  if (mode === 'list') {
    musicIds = [...cfg.trackIds];
    if (musicMode === 'list' && musicPlayer) {
      // Same mode → list edits only swap the queue; playback is untouched. The one exception:
      // the playing track was deleted — fall to the top of the new list.
      if (musicCurrentId && !musicIds.includes(musicCurrentId)) {
        musicHistory = [];
        playMusicId(musicIds[0]!);
      }
    } else {
      // Entering list mode — carry the playing track over when it survives in the list.
      const resumeId = currentMusicVideoId();
      const resumeTime = musicPlayer?.getCurrentTime() ?? 0;
      const keep = resumeId !== null && musicIds.includes(resumeId);
      teardownMusic();
      void createMusicPlayer({
        mode: 'list',
        videoId: keep ? resumeId : musicIds[0]!,
        startSeconds: keep ? resumeTime : 0,
      });
    }
    musicPlaylistId = null;
  } else if (mode === 'playlist') {
    if (musicMode !== 'playlist' || musicPlaylistId !== cfg.playlistId) {
      teardownMusic();
      void createMusicPlayer({ mode: 'playlist', playlistId: cfg.playlistId! });
    } else {
      musicPlayer?.setShuffle(musicShuffle);
    }
    musicPlaylistId = cfg.playlistId;
  } else {
    teardownMusic();
    musicPlaylistId = null;
  }
  musicMode = mode;
  updateMusicVisibility();
}

/** Hidden = clipped to 1px and transparent, but still rendered so audio keeps playing
 *  (display:none would stop playback). Visible = small corner player. */
function updateMusicVisibility(): void {
  if (!musicWrap) return;
  // Hidden by the OBS setting, or while suspended (a post is up) — clipped to 1px but still rendered
  // so audio isn't killed (display:none would stop playback). Otherwise a small corner player.
  musicWrap.style.cssText =
    musicHidden || musicSuspended
      ? 'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;z-index:0'
      : 'position:fixed;left:12px;bottom:12px;width:240px;height:135px;border-radius:8px;overflow:hidden;box-shadow:0 8px 24px -10px rgba(0,0,0,.6);pointer-events:none;z-index:5';
}

function teardownMusic(): void {
  musicEpoch++;
  setMusicTicker(false);
  if (musicFadeTimer !== undefined) {
    window.clearInterval(musicFadeTimer);
    musicFadeTimer = undefined;
  }
  if (musicHideTimer !== undefined) {
    window.clearTimeout(musicHideTimer);
    musicHideTimer = undefined;
  }
  musicAppliedVol = 0;
  musicPlayer?.destroy();
  musicPlayer = null;
  musicWrap?.remove();
  musicWrap = null;
  musicCurrentId = null;
  musicHistory = [];
}

interface MusicPlayerInit {
  mode: 'list' | 'playlist';
  /** List mode: the single video to load (the queue lives in musicIds). */
  videoId?: string;
  startSeconds?: number;
  /** Playlist mode: YT's native playlist id. */
  playlistId?: string;
}

async function createMusicPlayer(init: MusicPlayerInit): Promise<void> {
  const epoch = musicEpoch;
  await loadYouTubeApi();
  // Config may have changed (or cleared) while the API loaded.
  if (!window.YT || epoch !== musicEpoch) return;
  const wrap = document.createElement('div');
  const mount = document.createElement('div');
  wrap.appendChild(mount);
  document.body.appendChild(wrap);
  musicWrap = wrap;
  updateMusicVisibility();
  if (init.mode === 'list') musicCurrentId = init.videoId ?? null;
  musicPlayer = new window.YT.Player(mount, {
    width: '100%',
    height: '100%',
    videoId: init.mode === 'list' ? init.videoId : undefined,
    playerVars:
      init.mode === 'list'
        ? {
            autoplay: 1,
            start: Math.floor(init.startSeconds ?? 0),
            controls: 0,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
          }
        : {
            listType: 'playlist',
            list: init.playlistId!,
            autoplay: 1,
            loop: 1,
            controls: 0,
            rel: 0,
            playsinline: 1,
            modestbranding: 1,
          },
    events: {
      onReady: (e) => {
        if (init.mode === 'playlist') e.target.setShuffle(musicShuffle);
        setMusicVol(effectiveMusicVolume());
        e.target.playVideo();
        if (musicSuspended) e.target.pauseVideo(); // recreated while a post is on screen
        const f = e.target.getIframe();
        f.style.width = '100%';
        f.style.height = '100%';
      },
      onStateChange: (e) => {
        if (!window.YT) return;
        // PLAYING also fires on each new track — reports the advanced videoId to the dashboard.
        if (e.data === window.YT.PlayerState.PLAYING) {
          reportMusicState(true);
          setMusicTicker(true);
        } else if (e.data === window.YT.PlayerState.PAUSED) {
          reportMusicState(false);
          setMusicTicker(false);
        } else if (e.data === window.YT.PlayerState.ENDED && musicMode === 'list') {
          // The player holds a single video, so track advance is ours.
          stepMusic(1);
        }
      },
      onError: () => {
        // A dead/blocked video would stall the single-video player — skip it (delay avoids a
        // tight loop when several in a row are dead).
        if (musicMode === 'list') window.setTimeout(() => stepMusic(1), 800);
      },
    },
  });
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
  stopProgress();
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
    suspendMusic(false); // screen idle → reveal and fade the background music back up
    if (id) socket.emit('playback:done', id);
  }, 300);
}

function clearStage(): void {
  stopProgress();
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
  founder: boolean;
  nickGlow: boolean;
  cardEffect: string;
  /** Catalog id, or 'none' for the stage's own pop-in. */
  entrance: string;
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
    // Sample cosmetics so the demo shows nick color + effects + badges on stream.
    senderColor: st.sender ? '#ff9ed8' : undefined,
    // Deliberately not the brand mint: a mint 2nd stop makes the glow's outer halo look like a
    // hardcoded default rather than the viewer's own colour.
    senderColor2: st.sender ? '#a78bfa' : undefined,
    senderNickFlow: st.sender || undefined,
    senderLevel: st.sender ? 7 : undefined,
    senderEffect: st.sender && st.nickGlow ? 'nick-glow' : undefined,
    senderCardEffect: st.cardEffect !== 'none' ? st.cardEffect : undefined,
    senderEntrance: st.entrance !== 'none' ? st.entrance : undefined,
    senderBadges: st.sender && st.founder ? ['founder'] : undefined,
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
  // Demo the YouTube song request (youtubeMusic) — the unified compact player card, our common
  // channel-points case. A plain video request (youtubeMusic off) uses the full-size path instead.
  if (kind === 'youtube')
    return { ...base, youtubeId: SAMPLE_YT, durationMs: 0, text: cap, youtubeMusic: true };
  return { ...base, url: sampleAudio(), durationMs: 12_000, text: cap };
}

function mountDemoPanel(): void {
  const st: DemoState = {
    pos: 'center',
    size: 60,
    sender: true,
    caption: true,
    sound: false,
    founder: true,
    nickGlow: true,
    cardEffect: 'card-levitation',
    // On by default: an entrance is invisible unless you happen to fire an alert while looking, so
    // the demo shows it rather than hiding it behind a click nobody knows to make.
    entrance: 'entrance-glitch',
  };

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
    #demo-panel button.on{border-color:#8df0cc;color:#8df0cc;background:#8df0cc22}
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
  const toggle = (label: string, key: 'sender' | 'caption' | 'sound' | 'founder' | 'nickGlow') => {
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
  toggles.append(
    toggle('имя', 'sender'),
    toggle('подпись', 'caption'),
    toggle('звук', 'sound'),
    toggle('бейдж', 'founder'),
    toggle('свечение', 'nickGlow'),
  );
  panel.appendChild(toggles);

  section('эффект карточки');
  const fxRow = document.createElement('div');
  fxRow.className = 'row';
  // Registry-driven: every card effect gets a preview button (id sans 'card-' prefix as label).
  const fxButtons = (
    [
      ['none', 'Нет'],
      ...COSMETICS.filter((c) => c.type === 'card_effect').map(
        (c) => [c.id, c.id.replace(/^card-/, '')] as [string, string],
      ),
    ] as [string, string][]
  ).map(([val, label]) => {
    const b = btn(label, () => {
      st.cardEffect = val;
      fxButtons.forEach((x) => x.classList.toggle('on', x === b));
    });
    if (val === st.cardEffect) b.classList.add('on');
    fxRow.appendChild(b);
    return b;
  });
  panel.appendChild(fxRow);

  section('появление');
  const entRow = document.createElement('div');
  entRow.className = 'row';
  // Same registry-driven shape as the card effects above: a new entrance shows up here for free.
  // An entrance is a ONE-SHOT, so it only speaks when an alert is fired — pick it, then fire.
  const entButtons = (
    [
      ['none', 'Обычное'],
      ...COSMETICS.filter((c) => c.type === 'entrance').map(
        (c) => [c.id, c.id.replace(/^entrance-/, '')] as [string, string],
      ),
    ] as [string, string][]
  ).map(([val, label]) => {
    const b = btn(label, () => {
      st.entrance = val;
      entButtons.forEach((x) => x.classList.toggle('on', x === b));
    });
    if (val === st.entrance) b.classList.add('on');
    entRow.appendChild(b);
    return b;
  });
  panel.appendChild(entRow);

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
// Demo the background music without a server: ?demo&music=<playlistId or URL>&mvol=40&mhide=1
// or a raw track list: ?demo&musicIds=<id,id,id>&mvol=40
if (DEMO) {
  const q = new URLSearchParams(window.location.search);
  const raw = q.get('music');
  const ids = (q.get('musicIds') ?? '').split(',').filter(Boolean);
  if (raw || ids.length) {
    applyMusicConfig({
      trackIds: ids,
      playlistId: ids.length ? null : youtubePlaylistId(raw ?? ''),
      shuffle: q.has('mshuffle'),
      volume: Number(q.get('mvol')) || 40,
      hidden: q.has('mhide'),
    });
  }
  // Debug probe + reorder/command drivers for verification (demo only).
  (window as unknown as { __music: () => unknown }).__music = () => ({
    mode: musicMode,
    queue: musicIds,
    playlistId: musicPlaylistId,
    shuffle: musicShuffle,
    volume: musicVolume,
    effective: effectiveMusicVolume(),
    suspended: musicSuspended,
    hidden: musicHidden,
    hasPlayer: !!musicPlayer,
    currentId: currentMusicVideoId(),
    currentTime: musicPlayer?.getCurrentTime() ?? 0,
    wrapStyle: musicWrap?.getAttribute('style') ?? null,
  });
  (window as unknown as { __applyMusic: (c: MusicConfig) => void }).__applyMusic = applyMusicConfig;
  (window as unknown as { __musicCmd: (c: MusicCommand) => void }).__musicCmd = handleMusicCommand;
}
