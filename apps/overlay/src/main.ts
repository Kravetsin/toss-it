import '@fontsource/jetbrains-mono';
// The stage's looks, next to the code that builds it (see the note in chat.ts).
import './overlay-base.css';
import './alert.css';
import { connectOverlay, overlayServerUrl, type OverlaySocket } from './socket';
import {
  COSMETICS,
  LEVEL_GLOW_FROM,
  OVERLAY_POSITIONS,
  applyEntrance,
  applyStyleMap,
  frameEffectClass,
  frameTintVar,
  sealEffectClass,
  sealMarkup,
  giphyClipUrls,
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
  type MusicDisplay,
  type OverlayLayout,
  type OverlayPosition,
  type PlaybackDoneReason,
  type PlaybackSlot,
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
  /** Current video metadata — used for the background player's title marquee (no API key needed). */
  getVideoData(): { video_id?: string; title?: string; author?: string };
  /** Toggle a player module (e.g. 'captions'/'cc') — used to force closed captions off. */
  unloadModule(module: string): void;
  /** Resolution YouTube picked ('tiny'…'hd1080'). Read-only signal: it follows the player's size,
   *  which is how compact mode ends up decoding less. */
  getPlaybackQuality?(): string;
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

// Badge id -> inline SVG, rendered in mint after the name (no React icon set in the overlay).
// Founder = the Tossit emblem itself, not an icon-set glyph (see web BrandSeal / UserBadges).
const BADGE_SVG: Record<string, string> = {
  founder:
    '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="10.6" fill="#0c1a15" stroke="currentColor" stroke-width="1.3"/><path transform="translate(2.4 2.4) scale(0.8)" fill="currentColor" d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"/></svg>',
};

// Dev: server on separate port. Prod: overlay served by the server (same-origin, unless ?server=).
const SERVER_URL = overlayServerUrl();

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

const socket: OverlaySocket = DEMO
  ? demoSocketStub()
  : connectOverlay(SERVER_URL, token ?? '', 'media');

/**
 * One playing position on screen. There are two — see PlaybackSlot: a song can hold the compact
 * player while images and gifs keep arriving on the main stage. Everything a show owns lives here,
 * because two of them run at once and a module-level variable can only describe one.
 */
interface ShowState {
  /** The flex container this slot's card is anchored in. */
  readonly el: HTMLElement;
  currentId: string | null;
  hideTimer: number | undefined;
  finishing: boolean;
  ytPlayer: YTPlayer | null;
  ytReportedSid: string | null;
  exitTimer: number | undefined;
  /** Playback controls: pause state + progress reporting for the dashboard's now-playing bar. */
  paused: boolean;
  kind: MediaKind | null;
  /** A YouTube post — the channel's YouTube switch decides which anchor it uses. */
  isYoutube: boolean;
  /** An uploaded audio file — always the compact player, switch or not. */
  isAudio: boolean;
  /** This post is riding the music anchor, so the music display mode governs it too. */
  onMusicAnchor: boolean;
  /** Whatever of the layout this post's own sender picked. Survives a live layout change: the
   *  streamer moving their defaults mid-show must not undo the corner (or size) it was sent with,
   *  while the knobs the sender left alone still follow along. */
  viewerLayout: Partial<OverlayLayout> | null;
  mediaEl: HTMLVideoElement | HTMLAudioElement | null;
  /** Image/gif/text have no player — we track their display window so it can be frozen. */
  timedDurationMs: number;
  timedElapsedMs: number;
  timedStartTs: number;
  progressTimer: number | undefined;
  /** TTS is speaking right now — ducks the other slot for the speech only. */
  speaking: boolean;
  /** The speech playing right now. Detached from the DOM, so clearing the stage cannot stop it —
   *  this handle is the only way, and without it a skipped post kept talking over the next one. */
  speechEl: HTMLAudioElement | null;
  /** Bumped whenever a show ends or is replaced: the name→message chain checks it before starting
   *  the next part, so a skip mid-name does not let the message follow it out. */
  speechRun: number;
  /** Held silent by a sounded post in the other slot. Deliberately separate from `paused`, which is
   *  the streamer's own decision — conflating the two made ducking undo the pause button. */
  ducked: boolean;
}

let ytApiPromise: Promise<void> | null = null;

/** The music stage is built here rather than in the HTML: both overlays share that file. */
const musicStage = document.createElement('div');
musicStage.id = 'stage-music';
document.body.appendChild(musicStage);

const newShow = (el: HTMLElement): ShowState => ({
  el,
  currentId: null,
  hideTimer: undefined,
  finishing: false,
  ytPlayer: null,
  ytReportedSid: null,
  exitTimer: undefined,
  paused: false,
  kind: null,
  isYoutube: false,
  isAudio: false,
  onMusicAnchor: false,
  viewerLayout: null,
  mediaEl: null,
  timedDurationMs: 0,
  timedElapsedMs: 0,
  timedStartTs: 0,
  progressTimer: undefined,
  speaking: false,
  speechEl: null,
  speechRun: 0,
  ducked: false,
});

const shows: Record<PlaybackSlot, ShowState> = {
  media: newShow(stage),
  music: newShow(musicStage),
};
/** Bundles older than parallel slots send no slot; everything they send is the media stage. */
const showFor = (slot: PlaybackSlot | undefined): ShowState =>
  slot === 'music' ? shows.music : shows.media;
/** The show holding this submission, if any. */
const showOf = (submissionId: string): ShowState | null =>
  [shows.media, shows.music].find((sh) => sh.currentId === submissionId) ?? null;

socket.on('media:play', (payload) => show(showFor(payload.slot), payload));
socket.on('media:skip', (submissionId) => {
  const sh = showOf(submissionId);
  if (sh) finish(sh);
});
socket.on('media:control', (action, slot) => {
  const sh = showFor(slot);
  if (!sh.currentId) return;
  if (action === 'pause') pausePlayback(sh);
  else resumePlayback(sh);
});
socket.on('media:volume', (volume) => {
  // One slider for both stages, by design — see the plan. Applies to whatever is playing.
  const v = Math.min(100, Math.max(0, volume));
  for (const sh of [shows.media, shows.music]) {
    if (!sh.currentId) continue;
    // video + audio (incl. the music widget's <audio>) go through mediaEl; YouTube via its player.
    if (sh.mediaEl) sh.mediaEl.volume = v / 100;
    else if (sh.kind === 'youtube') sh.ytPlayer?.setVolume(v);
  }
});
socket.on('media:seek', (seconds, slot) => {
  const sh = showFor(slot);
  if (!sh.currentId) return;
  const s = Math.max(0, seconds);
  // Only media with a real timeline; image/gif/text run on a fixed hide timer (not seekable).
  if (sh.mediaEl) sh.mediaEl.currentTime = s;
  else if (sh.kind === 'youtube') sh.ytPlayer?.seekTo(s, true);
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
// Layout settings were saved. Only the post already on screen needs this — the next one carries its
// own layout in the play payload.
socket.on('media:layout', (layouts) => {
  // Same rule as the server's resolveLayout, re-run against the settings that just changed: the
  // YouTube switch can move the very video that is playing, and since both anchors render the same
  // card, it slides across instead of restarting.
  for (const sh of [shows.media, shows.music]) {
    if (!sh.currentId) continue;
    const music = sh.isYoutube ? layouts.youtubeAsMusic : sh.isAudio;
    sh.onMusicAnchor = music; // the switch can move a post onto (or off) the music anchor mid-show
    const card = sh.el.querySelector<HTMLElement>('.player');
    // A sender's own choices outlive the settings change, but only on the media side — a post the
    // switch just moved to the music player takes the music anchor like any other song.
    const layout = music ? layouts.music : { ...layouts.media, ...sh.viewerLayout };
    animateLayoutMove(card, () => {
      applyStageLayout(sh, layout);
      applyShowCompact(sh);
    });
  }
});

function show(sh: ShowState, payload: MediaPlayPayload): void {
  // Deliberately unconditional, even for the show already on screen: after a server restart the
  // overlay is told to play the current post again, and rebuilding it from scratch is what makes
  // the two sides agree. Skipping the rebuild left the card playing but the controls dead.
  clearStage(sh);
  sh.currentId = payload.submissionId;
  sh.finishing = false;
  sh.paused = false;
  sh.kind = payload.kind;
  duckBackgroundMusic(); // a post is up → fade out, pause and hide the background playlist

  // Which of the channel's two anchors this post uses. The server already decided it for this
  // payload; we keep the inputs so a later settings change (including the YouTube switch) can
  // re-decide without waiting for the next post.
  sh.isYoutube = payload.kind === 'youtube';
  sh.isAudio = payload.kind === 'audio';
  // A YouTube post follows the channel's switch (the server already applied it here); audio always
  // rides the music anchor. Both are "music" as far as the compact display mode is concerned.
  sh.onMusicAnchor = sh.isYoutube ? !!payload.youtubeMusic : sh.isAudio;
  // Already folded into the payload by the server; kept so a live layout change can re-apply it.
  sh.viewerLayout = payload.viewerLayout ?? null;
  applyStageLayout(sh, payload);

  const url = resolveMediaUrl(payload.url);
  const alert = document.createElement('div');
  alert.className = 'alert enter';
  // The alert IS the thing arriving, so it wears the entrance itself. Unequipped leaves the stage's
  // own pop-in running (see .alert.enter:not([data-fx]) in index.html).
  applyEntrance(alert, payload.senderEntrance, reduceMotion, payload.senderEntranceColor);

  const media = createMediaElement(sh, payload, url);
  alert.appendChild(buildCard(payload, media));
  sh.el.appendChild(alert);
  applyShowCompact(sh);

  if (payload.sound) playChime(payload.volume);
  scheduleSpeech(sh, payload);

  // Progress/pause plumbing. video/audio play through a media element; image/gif/text run on the
  // hide timer below, whose window we mirror here so pause can freeze it.
  sh.mediaEl = alert.querySelector<HTMLVideoElement | HTMLAudioElement>('video, audio');
  const startClock = () => {
    // Hard cap: leaves screen no later than server-issued durationMs.
    // YouTube uses durationMs=0 (no cap) — finishes on the player's 'ended' event.
    if (payload.durationMs <= 0) return;
    sh.hideTimer = window.setTimeout(() => finish(sh), payload.durationMs);
    if (!sh.mediaEl) {
      sh.timedDurationMs = payload.durationMs;
      sh.timedElapsedMs = 0;
      sh.timedStartTs = Date.now();
    }
  };
  // A still gets its window from the moment it actually has pixels. Starting the clock at insert
  // time meant a slow picture spent its airtime loading — and a card whose image never arrived stood
  // there empty for the full window. Until it loads no clock runs, so the position stays at zero and
  // the server's stall guard reaps it if it never comes at all.
  // The media element itself rather than a query into the card: whatever decoration the card grows
  // later must not be able to become the thing the clock waits on.
  const still = media instanceof HTMLImageElement ? media : null;
  if (still && still.getAttribute('src') && !still.complete) {
    still.addEventListener('load', startClock, { once: true });
  } else {
    startClock();
  }
  sh.progressTimer = window.setInterval(() => emitProgress(sh), 350);
  // A sounded post must not fight the song in the other slot.
  updateSlotDucking();
}

/**
 * Fill a sender container — the `.sender` banner (image/video) or the music player's `.player-meta`
 * footer — with the level rail + numeral, the earned seal, the cosmetic-tinted name, and badges.
 * Shared so both surfaces stay identical. The card effect belongs to the sender, so it plays here,
 * on the short name row, not over the media the viewer sent.
 */
function decorateSender(el: HTMLElement, payload: MediaPlayPayload): void {
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
  // Seal: earned mark, read as a rank insignia — so it leads the name, right after the level.
  const sealCls = sealEffectClass(payload.senderSeal);
  if (sealCls) {
    const seal = document.createElement('span');
    seal.className = `sender-seal ${sealCls}`;
    // Constant markup from the cosmetics registry — not user input.
    seal.innerHTML = sealMarkup(payload.senderSeal);
    // Colourable seals read their tint from --seal-tint; a plain seal ignores it.
    if (payload.senderSealColor) seal.style.setProperty('--seal-tint', payload.senderSealColor);
    el.appendChild(seal);
  }
  // Wrap the name so an equipped nick color tints only the name, not the seal/badges.
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
  if (payload.senderCardEffect)
    mountCardEffect(
      el,
      payload.senderCardEffect,
      'overlayCard',
      true,
      payload.senderCardEffectColor,
    );
}

/** Build the one unified submission card: media (or text) on top, a single meta row (sender + caption
 *  marquee) below. Every kind goes through here so posts read as one cohesive card — only the per-kind
 *  class tunes the media box (16:9 for YouTube, hug-the-clip for image/video, text body). */
function buildCard(payload: MediaPlayPayload, media: HTMLElement): HTMLElement {
  const player = document.createElement('div');
  player.className = 'player';
  const frameCls = frameEffectClass(payload.senderFrame);
  if (frameCls) player.classList.add(frameCls);
  // Colourable frames read their tint from --frame-rgb; an untinted one keeps the module's mint.
  const frameTint = frameTintVar(payload.senderFrameColor);
  if (frameTint) player.style.setProperty('--frame-rgb', frameTint);
  if (payload.kind === 'youtube') player.classList.add('is-youtube');
  else if (payload.kind === 'image' || payload.kind === 'gif' || payload.kind === 'video')
    player.classList.add('has-media');
  else if (payload.kind === 'text') player.classList.add('is-text');
  // audio keeps the base .player — the music widget carries its own look.

  const mediaBox = document.createElement('div');
  mediaBox.className = 'player-media';
  mediaBox.appendChild(media);
  player.appendChild(mediaBox);

  // Meta row: sender + caption marquee. Text-only has no caption — the message IS the body above, so
  // only the sender shows there.
  const caption = payload.kind !== 'text' ? payload.text : undefined;
  if (payload.senderName || caption) {
    const meta = document.createElement('div');
    meta.className = 'player-meta';
    if (payload.senderName) decorateSender(meta, payload);
    if (caption) appendCaptionMarquee(meta, caption, !!payload.senderName);
    player.appendChild(meta);
  }
  // A requested song can be shown compact (video clipped away, see .music-compact) — the strip is
  // what's left telling the room something is playing, so it ships with every such card.
  if (payload.kind === 'youtube' && payload.youtubeMusic) {
    const progress = document.createElement('div');
    progress.className = 'music-progress';
    progress.style.display = 'none'; // applyShowCompact turns it on when the mode says so
    progress.style.setProperty('--tick', '0.35s'); // matches the show's progress interval
    progress.appendChild(Object.assign(document.createElement('div'), { className: 'fill' }));
    player.appendChild(progress);
  }
  return player;
}

/** Put the current post in (or out of) compact music mode. Only a requested song qualifies: an
 *  uploaded audio post has no video to drop, and an image/video post isn't music at all.
 *  'hidden' lands here as compact too — the axis is monotonic (less video the further right), and a
 *  paid request must never vanish outright: the song plays on, so an empty screen would read as a bug. */
function applyShowCompact(sh: ShowState): void {
  const card = sh.el.querySelector<HTMLElement>('.player');
  if (!card) return;
  const compact = sh.isYoutube && sh.onMusicAnchor && musicDisplay !== 'full';
  card.classList.toggle('music-compact', compact);
  const bar = card.querySelector<HTMLElement>('.music-progress');
  if (bar) bar.style.display = compact ? '' : 'none';
}

/** Append the submission text to a meta row as a clipped, ping-pong marquee. A leading separator is
 *  added when a sender precedes it. Shared by every kind so the caption reads the same way. */
function appendCaptionMarquee(row: HTMLElement, text: string, afterSender: boolean): void {
  if (afterSender) {
    const sep = document.createElement('span');
    sep.className = 'meta-sep';
    sep.textContent = '·';
    row.appendChild(sep);
  }
  // Caption viewport clips; the inner track scrolls (ping-pong) only when it overflows.
  const cap = document.createElement('span');
  cap.className = 'player-caption';
  const track = document.createElement('span');
  track.className = 'marq-track';
  track.textContent = text;
  cap.appendChild(track);
  row.appendChild(cap);
  applyMarquee(cap, track);
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

/**
 * Move a card to wherever `apply` puts it, smoothly. The anchor is flex, and justify-content /
 * align-items are discrete properties no transition can touch — so measure, apply, then start the
 * card from its old spot and let the CSS transition on .player carry it back to zero (FLIP).
 * Transform only: the size change rides the same transition on its own.
 */
function animateLayoutMove(el: HTMLElement | null, apply: () => void): void {
  if (!el || reduceMotion) {
    apply();
    return;
  }
  const before = el.getBoundingClientRect();
  apply();
  const after = el.getBoundingClientRect();
  const dx = before.left - after.left;
  const dy = before.top - after.top;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return; // size-only change — CSS already handles it
  el.style.transition = 'none'; // jump back without animating...
  el.style.transform = `translate(${dx}px, ${dy}px)`;
  requestAnimationFrame(() => {
    // ...then hand both properties back to the stylesheet, which animates the way home.
    el.style.transition = '';
    el.style.transform = '';
  });
}

/** Anchor the stage: position drives the flex corner, margin the inset, size the card's scale. */
function applyStageLayout(sh: ShowState, layout: OverlayLayout): void {
  const { justify, align } = positionToFlex(layout.position);
  sh.el.style.justifyContent = justify;
  sh.el.style.alignItems = align;
  sh.el.style.padding = `${layout.margin}vh ${layout.margin}vw`;
  sh.el.style.setProperty('--overlay-size', String(layout.size));
}

/** Report a show's position to the server (relayed to the dashboard). */
function emitProgress(sh: ShowState): void {
  if (!sh.currentId) return;
  let positionMs = 0;
  let durationMs = 0;
  if (sh.mediaEl) {
    positionMs = Math.round(sh.mediaEl.currentTime * 1000);
    durationMs =
      Number.isFinite(sh.mediaEl.duration) && sh.mediaEl.duration > 0
        ? Math.round(sh.mediaEl.duration * 1000)
        : 0;
  } else if (sh.kind === 'youtube' && sh.ytPlayer) {
    try {
      positionMs = Math.round(sh.ytPlayer.getCurrentTime() * 1000);
      durationMs = Math.round(sh.ytPlayer.getDuration() * 1000);
    } catch {
      /* player not ready yet */
    }
  } else if (sh.timedDurationMs > 0) {
    positionMs = sh.timedElapsedMs + (sh.paused ? 0 : Date.now() - sh.timedStartTs);
    durationMs = sh.timedDurationMs;
  }
  // The compact strip rides this same tick rather than a timer of its own.
  const fill = sh.el.querySelector<HTMLElement>('.music-progress .fill');
  if (fill) setFillWidth(fill, durationMs > 0 ? (positionMs / durationMs) * 100 : 0);
  socket.emit('playback:progress', {
    submissionId: sh.currentId,
    positionMs,
    durationMs,
    paused: sh.paused,
    slot: slotNameOf(sh),
  });
}

function pausePlayback(sh: ShowState): void {
  if (sh.paused || !sh.currentId) return;
  sh.paused = true;
  // Speech runs beside the post, not through it — every branch below has to leave it silent too.
  sh.speechEl?.pause();
  if (sh.mediaEl) sh.mediaEl.pause();
  else if (sh.kind === 'youtube') sh.ytPlayer?.pauseVideo();
  else if (sh.timedDurationMs > 0 && sh.hideTimer !== undefined) {
    window.clearTimeout(sh.hideTimer);
    sh.hideTimer = undefined;
    sh.timedElapsedMs += Date.now() - sh.timedStartTs; // bank the elapsed slice
  }
  emitProgress(sh);
  updateSlotDucking(); // a paused video stops competing with the song next door
}

function resumePlayback(sh: ShowState): void {
  if (!sh.paused || !sh.currentId) return;
  sh.paused = false;
  void sh.speechEl?.play().catch(() => {});
  if (sh.mediaEl) void sh.mediaEl.play().catch(() => {});
  else if (sh.kind === 'youtube') sh.ytPlayer?.playVideo();
  else if (sh.timedDurationMs > 0) {
    sh.timedStartTs = Date.now();
    sh.hideTimer = window.setTimeout(
      () => finish(sh),
      Math.max(0, sh.timedDurationMs - sh.timedElapsedMs),
    );
  }
  emitProgress(sh);
  updateSlotDucking();
}

/** Stop and reset the progress/pause plumbing (on finish or a new show). */
function stopProgress(sh: ShowState): void {
  if (sh.progressTimer !== undefined) {
    window.clearInterval(sh.progressTimer);
    sh.progressTimer = undefined;
  }
  sh.paused = false;
  sh.mediaEl = null;
  sh.kind = null;
  sh.timedDurationMs = 0;
}

/**
 * Hand the media's own pixel size to CSS, which scales it up to the chosen size within the ×2 cap
 * (see .player.has-media img[data-nat]). Custom properties rather than a computed width, so a live
 * size change from the dashboard still lands without recomputing anything here.
 */
function markNaturalSize(el: HTMLImageElement | HTMLVideoElement): void {
  const isVideo = el instanceof HTMLVideoElement;
  el.addEventListener(
    isVideo ? 'loadedmetadata' : 'load',
    () => {
      const w = isVideo ? el.videoWidth : el.naturalWidth;
      const h = isVideo ? el.videoHeight : el.naturalHeight;
      if (!w || !h) return; // a broken file keeps the ceiling-only rules rather than width: 0
      el.style.setProperty('--nat-w', String(w));
      el.style.setProperty('--nat-ratio', String(w / h));
      el.dataset.nat = '';
    },
    { once: true },
  );
}

/** Attempts a still gets before we admit it is not coming. Delays grow: 0.4s, 0.8s. */
const STILL_RETRIES = 2;
const STILL_RETRY_MS = 400;

/**
 * Fetch a still, and push it if it does not arrive. An <img> that fails fires 'error' and, with
 * nobody listening, left an empty card standing for its whole window — which is why the same picture
 * could air fine on the next try: the failure was a transient fetch, and nothing ever retried it.
 * The retry carries a cache-buster, or a negative cache in the browser source would hand back the
 * same failure; out of attempts we end the show instead of holding an empty frame.
 */
function loadStill(sh: ShowState, img: HTMLImageElement, src: string): void {
  let attempt = 0;
  const fetchIt = () => {
    img.src = attempt === 0 ? src : `${src}${src.includes('?') ? '&' : '?'}retry=${attempt}`;
  };
  img.addEventListener('error', () => {
    if (attempt++ < STILL_RETRIES) {
      window.setTimeout(fetchIt, STILL_RETRY_MS * attempt);
      return;
    }
    finish(sh, 'error');
  });
  fetchIt();
}

function createMediaElement(sh: ShowState, payload: MediaPlayPayload, url: string): HTMLElement {
  const volume = Math.min(100, Math.max(0, payload.volume ?? 100)) / 100;

  if (payload.kind === 'text') {
    // Text-only: skip /api/media, render the message as the card body (the card frame comes from
    // .player.is-text — no inner frame of its own).
    const body = document.createElement('div');
    body.className = 'text-body';
    body.textContent = payload.text ?? '';
    return body;
  }

  if (payload.kind === 'image') {
    const img = document.createElement('img');
    markNaturalSize(img);
    loadStill(sh, img, url);
    return img;
  }

  if (payload.kind === 'gif') {
    // No stored file: render the looping GIF straight from Giphy's CDN.
    const img = document.createElement('img');
    markNaturalSize(img);
    if (payload.giphyId) loadStill(sh, img, giphyGifUrl(payload.giphyId));
    return img;
  }

  if (payload.kind === 'video') {
    const video = document.createElement('video');
    markNaturalSize(video);
    video.autoplay = true;
    video.volume = volume;
    video.addEventListener('ended', () => finish(sh));
    // A Giphy clip has no stored file: it streams from Giphy's CDN, and which rendition exists
    // varies per clip (see GIPHY_CLIP_RENDITIONS), so walk down the list on error before giving up.
    const sources = payload.giphyId ? giphyClipUrls(payload.giphyId) : [url];
    let next = 0;
    const load = () => {
      // Every source starts out with its sound: switching src aborts the previous play(), and that
      // rejection must not be mistaken for a blocked autoplay (it silenced the whole clip).
      video.muted = false;
      video.src = sources[next++]!;
      // OBS allows autoplay with sound; a browser may block it — only THAT deserves a muted retry.
      video.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          video.muted = true;
          void video.play();
        }
      });
    };
    video.addEventListener('error', () => {
      if (next < sources.length) return load();
      // Out of renditions: report it now, like the YouTube player does on its own error. A clip
      // carries no durationMs, so nothing else would free the slot before the server's watchdog.
      finish(sh, 'error');
    });
    load();
    return video;
  }

  if (payload.kind === 'youtube') {
    return createYoutubePlayer(sh, payload);
  }

  // Audio has nothing to show — render a player with progress + time.
  return createMusicWidget(sh, payload, url, volume);
}

/** Music widget: filling progress bar + mm:ss time. */
function createMusicWidget(
  sh: ShowState,
  payload: MediaPlayPayload,
  url: string,
  volume: number,
): HTMLElement {
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
  audio.addEventListener('ended', () => finish(sh));

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
function createYoutubePlayer(sh: ShowState, payload: MediaPlayPayload): HTMLElement {
  const container = document.createElement('div');
  container.className = 'youtube';
  // Every YouTube clip (song OR video) now lives inside the `.player` card: fill its 16:9 ratio box
  // (which handles the sizing the old-OBS-safe way, see .player.is-youtube .player-media in alert.css).
  container.style.position = 'absolute';
  container.style.inset = '0';
  container.style.width = '100%';
  container.style.height = '100%';

  const mount = document.createElement('div');
  container.appendChild(mount);

  const videoId = payload.youtubeId;
  const sid = payload.submissionId;
  if (!videoId) return container;

  void loadYouTubeApi().then(() => {
    // The show may have changed/ended while the YT API loaded — avoid an orphaned
    // player that keeps playing audio after destroyYoutube().
    if (sh.currentId !== sid || sh.finishing || !window.YT) return;
    sh.ytPlayer = new window.YT.Player(mount, {
      videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 0,
        rel: 0,
        playsinline: 1,
        modestbranding: 1,
        cc_load_policy: 0, // don't force captions on (the unload below actually turns them off)
        // Only the link's own timecode. A computed offset was tried here to resume a clip across a
        // reconnect: the player froze on the offset and never started, so the video is only ever
        // handed a position the viewer's own link asked for.
        start: payload.youtubeStartSeconds ?? 0,
      },
      events: {
        onReady: (e) => {
          if (sh.currentId !== sid || sh.finishing) return;
          e.target.setVolume(Math.min(100, Math.max(0, payload.volume)));
          e.target.playVideo();
          disableCaptions(e.target);
          const f = e.target.getIframe();
          f.style.width = '100%';
          f.style.height = '100%';
          reportYoutubeDuration(sh, sid, e.target);
        },
        onStateChange: (e) => {
          // Only react to the current show: an old player may emit a late ENDED
          // after we've switched to the next clip.
          if (sh.currentId !== sid || !window.YT) return;
          if (e.data === window.YT.PlayerState.ENDED) finish(sh);
          else if (e.data === window.YT.PlayerState.PLAYING) {
            disableCaptions(e.target); // captions can re-arm after buffering/ads
            reportYoutubeDuration(sh, sid, e.target);
          }
        },
        onError: () => {
          // Video won't play (age/region restriction, removed, etc.) — finish now
          // instead of holding an empty frame until the watchdog.
          if (sh.currentId === sid) finish(sh, 'error');
        },
      },
    });
  });

  return container;
}

/** Force closed captions off. The IFrame API has no "captions off" player var (only cc_load_policy:1
 *  forces them ON), and OBS's cookieless browser tends to auto-show them — so we unload the caption
 *  module once the player is ready. 'captions' (newer) + 'cc' (older) covers both module names. */
function disableCaptions(player: YTPlayer): void {
  try {
    player.unloadModule('captions');
    player.unloadModule('cc');
  } catch {
    /* module not loaded yet — the onStateChange(PLAYING) call catches it */
  }
}

/** Report the clip's real duration to the server, once per show (watchdog + now-playing panel). */
function reportYoutubeDuration(sh: ShowState, submissionId: string, player: YTPlayer): void {
  if (sh.ytReportedSid === submissionId) return;
  const ms = Math.round(player.getDuration() * 1000);
  if (ms > 0) {
    sh.ytReportedSid = submissionId;
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
// The glass card inside the wrap (sized/styled like the song-request player) + its title-marquee row.
let musicCard: HTMLElement | null = null;
let musicMetaEl: HTMLElement | null = null;
let musicTitleCap: HTMLElement | null = null;
let musicTitleTrack: HTMLElement | null = null;
// Compact mode only: the progress strip standing in for the hidden video.
let musicProgressEl: HTMLElement | null = null;
let musicProgressFill: HTMLElement | null = null;
// Player layout — the music block, shared with (optionally) song-request cards. Bottom-left compact
// by default so it matches the old hard-coded corner before the first config arrives.
let musicPosition: OverlayPosition = 'bottom-left';
let musicSize = 20;
let musicMargin = 2;
let musicMode: 'list' | 'playlist' | null = null;
let musicIds: string[] = []; // the owned queue (list mode); edits apply instantly
let musicCurrentId: string | null = null; // playing track in list mode
let musicHistory: string[] = []; // recently played stack, so prev works under shuffle
let musicPlaylistId: string | null = null; // fallback source (playlist mode)
let musicShuffle = false;
let musicVolume = 50;
let musicDisplay: MusicDisplay = 'full';
let musicSuspended = false; // a post is on screen → music faded out + paused + hidden
/**
 * The streamer pressed pause themselves. Kept apart from musicSuspended (our automatic ducking)
 * because both end in pauseVideo(): without the distinction, a post arriving after a manual pause
 * would resume the music on its way out, overriding the streamer.
 */
let musicUserPaused = false;
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
    if (musicUserPaused) {
      // The streamer had it paused before the post arrived — come back to exactly that: card
      // visible, music silent. Volume is restored (not faded) so their next play starts at level.
      setMusicVol(musicVolume);
      return;
    }
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
      musicUserPaused = false;
      musicPlayer.playVideo();
      // Re-assert state to the dashboard: a redundant play/pause (player already in that state)
      // fires no onStateChange, so without this the dashboard's toggle stays stuck on the wrong
      // icon and every press is a silent no-op. Reporting here always resyncs the remote.
      reportMusicState(true);
      break;
    case 'pause':
      musicUserPaused = true;
      musicPlayer.pauseVideo();
      reportMusicState(false);
      break;
    // next/prev/playAt all mean "start this track" — pressing one after a pause is a request to
    // play, so they clear the manual-pause intent along with moving the queue.
    case 'next':
      musicUserPaused = false;
      if (musicMode === 'list') stepMusic(1);
      else musicPlayer.nextVideo();
      break;
    case 'prev':
      musicUserPaused = false;
      if (musicMode === 'list') stepMusic(-1);
      else musicPlayer.previousVideo();
      break;
    case 'playAt': {
      if (!cmd.videoId) break;
      musicUserPaused = false;
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
  if (on)
    musicTicker = setInterval(() => {
      reportMusicState(true);
      updateMusicProgress();
    }, 1000);
}

function applyMusicConfig(cfg: MusicConfig): void {
  musicVolume = Math.min(100, Math.max(0, Math.round(cfg.volume)));
  const displayChanged = musicDisplay !== cfg.display;
  musicDisplay = cfg.display;
  musicShuffle = !!cfg.shuffle;
  musicPosition = cfg.position;
  musicSize = cfg.size;
  musicMargin = cfg.margin;
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
  // The layout knobs may have moved with this config — glide the player there rather than teleport
  // it. Hidden or suspended, there is nothing on screen to measure, so those just apply.
  if (musicDisplay === 'hidden' || musicSuspended) updateMusicVisibility();
  else animateLayoutMove(musicCard, updateMusicVisibility);
  if (!displayChanged) return;
  // The mode governs requested songs too, live: the streamer flips it mid-clip to drop a video they
  // don't want on screen, and the song keeps playing.
  for (const sh of [shows.media, shows.music]) if (sh.currentId) applyShowCompact(sh);
  // Switching to/from compact resizes the caption viewport, so the marquee has to be re-measured for
  // the width it now has — updateMusicTitle alone would bail out on the unchanged title.
  if (musicTitleCap && musicTitleTrack) {
    musicTitleTrack.style.animation = '';
    applyMarquee(musicTitleCap, musicTitleTrack);
  }
}

/** Hidden = clipped to 1px and transparent, but still rendered so audio keeps playing
 *  (display:none would stop playback). Visible = a card anchored by the music layout. */
function updateMusicVisibility(): void {
  if (!musicWrap) return;
  // Hidden by the OBS setting, or while suspended (a post is up) — clipped to 1px but still rendered
  // so audio isn't killed (display:none would stop playback).
  if (musicDisplay === 'hidden' || musicSuspended) {
    musicWrap.style.cssText =
      'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;z-index:0';
    return;
  }
  // A full-screen flex container anchors the card exactly like #stage does for a post, so the music
  // layout (position/margin) behaves identically to the media/song-request layout.
  const { justify, align } = positionToFlex(musicPosition);
  musicWrap.style.cssText =
    `position:fixed;inset:0;display:flex;justify-content:${justify};align-items:${align};` +
    `padding:${musicMargin}vh ${musicMargin}vw;pointer-events:none;z-index:5`;
  musicCard?.style.setProperty('--overlay-size', String(musicSize));
  // Compact drops the video to a strip: the class clips the iframe (still rendered, so audio lives)
  // and the progress bar takes over as the sign that something is playing.
  const compact = musicDisplay === 'compact';
  musicCard?.classList.toggle('music-compact', compact);
  if (musicProgressEl) musicProgressEl.style.display = compact ? '' : 'none';
  updateMusicTitle(); // the row's titleless visibility depends on the mode
  if (compact) updateMusicProgress();
}

/** Advance a progress strip. The CSS transition smooths the tick into motion, but a jump back (new
 *  track, seek, replay) must land instantly instead of gliding backwards. */
function setFillWidth(fill: HTMLElement, pct: number): void {
  const next = Math.min(100, Math.max(0, pct));
  const prev = parseFloat(fill.style.width) || 0;
  if (next < prev) {
    fill.style.transition = 'none';
    fill.style.width = `${next}%`;
    void fill.offsetWidth; // flush, so the restored transition doesn't animate the jump
    fill.style.transition = '';
    return;
  }
  fill.style.width = `${next}%`;
}

/** Compact mode: advance the background player's strip, on the same 1s ticker that reports state. */
function updateMusicProgress(): void {
  if (!musicProgressFill || musicDisplay !== 'compact') return;
  const dur = musicPlayer?.getDuration() ?? 0;
  const pos = musicPlayer?.getCurrentTime() ?? 0;
  setFillWidth(musicProgressFill, dur > 0 ? (pos / dur) * 100 : 0);
}

/** Pull the current track's title from the player (works without a YouTube API key) into the
 *  marquee row. No sender exists for background music, so the row is title-only. */
function updateMusicTitle(): void {
  if (!musicMetaEl || !musicTitleCap || !musicTitleTrack) return;
  let title = '';
  try {
    title = musicPlayer?.getVideoData?.().title ?? '';
  } catch {
    /* player API not ready yet */
  }
  // Compact keeps the row even titleless: with the video gone, the note is all that says "music".
  musicMetaEl.style.display = title || musicDisplay === 'compact' ? '' : 'none';
  if (!title || musicTitleTrack.textContent === title) return; // unchanged — don't restart the marquee
  musicTitleTrack.textContent = title;
  musicTitleTrack.style.animation = '';
  applyMarquee(musicTitleCap, musicTitleTrack);
}

// applyMarquee measures inside rAF, which a hidden page never runs (an OBS source on an inactive
// scene) — so the title would come back visible but unscrolled. Re-measure when it's shown again.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !musicTitleCap || !musicTitleTrack) return;
  musicTitleTrack.style.animation = '';
  applyMarquee(musicTitleCap, musicTitleTrack);
});

let musicTitleProbe: number | undefined;
/** The player reports an empty title for a moment after onReady — and for as long as playback hasn't
 *  been allowed to start. Keep asking until it answers, otherwise the compact strip stays nameless. */
function probeMusicTitle(): void {
  window.clearInterval(musicTitleProbe);
  const before = musicTitleTrack?.textContent ?? '';
  let tries = 0;
  musicTitleProbe = window.setInterval(() => {
    updateMusicTitle();
    if (++tries >= 25 || (musicTitleTrack?.textContent ?? '') !== before) {
      window.clearInterval(musicTitleProbe);
      musicTitleProbe = undefined;
    }
  }, 400);
}

function teardownMusic(): void {
  musicEpoch++;
  setMusicTicker(false);
  window.clearInterval(musicTitleProbe);
  musicTitleProbe = undefined;
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
  musicCard = null;
  musicMetaEl = null;
  musicTitleCap = null;
  musicTitleTrack = null;
  musicProgressEl = null;
  musicProgressFill = null;
  musicCurrentId = null;
  musicHistory = [];
  // A teardown means the source itself changed (new queue/playlist, or music switched off). The old
  // pause was about the old source — a fresh one must not come up silently.
  musicUserPaused = false;
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
  // Same glass card as a song-request player: 16:9 media box on top, a title-marquee row below.
  const wrap = document.createElement('div');
  const card = document.createElement('div');
  card.className = 'player is-youtube music-card';
  const mediaBox = document.createElement('div');
  mediaBox.className = 'player-media';
  const mount = document.createElement('div');
  mount.style.cssText = 'position:absolute;inset:0'; // fills the .player-media ratio box
  mediaBox.appendChild(mount);
  card.appendChild(mediaBox);
  const meta = document.createElement('div');
  meta.className = 'player-meta';
  meta.style.display = 'none'; // shown once a title is known
  // The note marks the strip as a music player at a glance once the video is gone (compact mode).
  const glyph = document.createElement('span');
  glyph.className = 'glyph music-note';
  glyph.textContent = '♪';
  const cap = document.createElement('span');
  cap.className = 'player-caption';
  const track = document.createElement('span');
  track.className = 'marq-track';
  cap.appendChild(track);
  meta.append(glyph, cap);
  card.appendChild(meta);
  // Compact mode's stand-in for the video: the same progress strip audio submissions use.
  const progress = document.createElement('div');
  progress.className = 'music-progress';
  progress.style.display = 'none';
  const fill = document.createElement('div');
  fill.className = 'fill';
  progress.appendChild(fill);
  card.appendChild(progress);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
  musicWrap = wrap;
  musicCard = card;
  musicMetaEl = meta;
  musicTitleCap = cap;
  musicTitleTrack = track;
  musicProgressEl = progress;
  musicProgressFill = fill;
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
            cc_load_policy: 0,
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
            cc_load_policy: 0,
          },
    events: {
      onReady: (e) => {
        if (init.mode === 'playlist') e.target.setShuffle(musicShuffle);
        setMusicVol(effectiveMusicVolume());
        e.target.playVideo();
        // Recreated while a post is on screen, or while the streamer had it paused.
        if (musicSuspended || musicUserPaused) e.target.pauseVideo();
        disableCaptions(e.target);
        const f = e.target.getIframe();
        f.style.width = '100%';
        f.style.height = '100%';
        probeMusicTitle();
      },
      onStateChange: (e) => {
        if (!window.YT) return;
        // PLAYING also fires on each new track — reports the advanced videoId to the dashboard.
        if (e.data === window.YT.PlayerState.PLAYING) {
          reportMusicState(true);
          setMusicTicker(true);
          disableCaptions(e.target); // captions can re-arm on each new track
          probeMusicTitle(); // a new track may have started — refresh the marquee
          updateMusicProgress();
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
function scheduleSpeech(sh: ShowState, payload: MediaPlayPayload): void {
  const parts: ('name' | 'message')[] = [];
  if (payload.tts) parts.push('name');
  if (payload.ttsText) parts.push('message');
  if (parts.length === 0) return;

  // Anything still speaking for a previous post loses the slot to this one.
  stopSpeech(sh);
  const run = sh.speechRun;
  let i = 0;
  const next = () => {
    // The show was skipped (or replaced) mid-sentence — the rest of it must not follow it out.
    if (run !== sh.speechRun) return;
    const part = parts[i++];
    if (!part) {
      // Speech over — the song in the other slot can come back up.
      sh.speaking = false;
      sh.speechEl = null;
      updateSlotDucking();
      return;
    }
    speak(sh, payload.submissionId, part, payload.volume, next);
  };
  // Ducked for the speech only, not for the whole show: a two-second name must not mute a song for
  // the eight seconds an image is up.
  sh.speaking = true;
  updateSlotDucking();
  // Small delay so speech doesn't overlap the chime.
  window.setTimeout(next, 280);
}

function speak(
  sh: ShowState,
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
    sh.speechEl = audio;
    // Held back while the streamer has the post paused — a pause landing in the pre-roll delay
    // must not let the line slip out anyway. resumePlayback starts it.
    if (!sh.paused) void audio.play().catch(onEnd);
  } catch {
    onEnd();
  }
}

/**
 * Cut the speech dead. Separate from clearing the stage because the audio element never was on it:
 * `new Audio()` is detached, so it outlived every skip until it was tracked on the show.
 */
function stopSpeech(sh: ShowState): void {
  sh.speechRun++;
  if (sh.speechEl) {
    sh.speechEl.pause();
    // Also stop it fetching. This fires 'error' on the old element, but the bumped run above is
    // what keeps that from walking the chain on to the next part.
    sh.speechEl.removeAttribute('src');
    sh.speechEl = null;
  }
  sh.speaking = false;
}

/** Stop and destroy a slot's YouTube player so audio cuts immediately on finish/skip. */
function destroyYoutube(sh: ShowState): void {
  if (sh.ytPlayer) {
    try {
      sh.ytPlayer.destroy();
    } catch {
      /* player may not have been created yet */
    }
    sh.ytPlayer = null;
  }
}

/**
 * Take the current show off screen. `reason` travels to the server because the two cases are not
 * the same thing: a clip the player refused to play (region lock, age gate, embedding off) never
 * aired, and a request paid for with channel points must get those points back.
 */
function finish(sh: ShowState, reason: PlaybackDoneReason = 'ended'): void {
  if (sh.finishing) return;
  sh.finishing = true;
  stopProgress(sh);
  destroyYoutube(sh);
  // Before the exit animation, not after it: a skip has to go quiet at once, like the video does.
  stopSpeech(sh);
  const id = sh.currentId;
  if (sh.hideTimer !== undefined) {
    window.clearTimeout(sh.hideTimer);
    sh.hideTimer = undefined;
  }
  // Exit animation, then cleanup and signal the server it can send the next one.
  const alert = sh.el.querySelector('.alert');
  alert?.classList.remove('enter');
  alert?.classList.add('exit');
  sh.exitTimer = window.setTimeout(() => {
    sh.exitTimer = undefined;
    sh.el.replaceChildren();
    sh.currentId = null;
    sh.speaking = false;
    // Both stages idle → reveal and fade the background playlist back up.
    if (!shows.media.currentId && !shows.music.currentId) suspendMusic(false);
    updateSlotDucking();
    if (id) socket.emit('playback:done', id, reason);
  }, 300);
}

function clearStage(sh: ShowState): void {
  stopProgress(sh);
  if (sh.hideTimer !== undefined) {
    window.clearTimeout(sh.hideTimer);
    sh.hideTimer = undefined;
  }
  // Cancel a pending exit timer: otherwise a media:play within 300ms of finish()
  // would wipe the already-shown next clip.
  if (sh.exitTimer !== undefined) {
    window.clearTimeout(sh.exitTimer);
    sh.exitTimer = undefined;
  }
  destroyYoutube(sh);
  stopSpeech(sh);
  sh.el.replaceChildren();
}

/**
 * The one rule that keeps two slots from talking over each other: a post with sound of its own —
 * a video, an audio file, or one currently speaking its TTS — ducks the song playing next door.
 * A silent image or gif leaves it alone, which is the entire point of parallel slots.
 */
function updateSlotDucking(): void {
  const media = shows.media;
  shows.music.ducked =
    !!media.currentId &&
    !media.paused &&
    (media.speaking ||
      media.kind === 'video' ||
      media.kind === 'audio' ||
      media.kind === 'youtube');
  applyMusicPlayState();
}

/**
 * The music slot plays only when nobody is holding it silent: not paused by the streamer, and not
 * ducked by a sounded post on the main stage. Both inputs go through here, so neither can quietly
 * undo the other — which is exactly what the pause button hit when ducking called play() behind it.
 */
function applyMusicPlayState(): void {
  const sh = shows.music;
  if (!sh.currentId) return;
  const shouldPlay = !sh.paused && !sh.ducked;
  if (sh.ytPlayer) {
    try {
      if (shouldPlay) sh.ytPlayer.playVideo();
      else sh.ytPlayer.pauseVideo();
    } catch {
      /* player not ready yet */
    }
  }
  if (sh.mediaEl) {
    if (shouldPlay) void sh.mediaEl.play().catch(() => {});
    else sh.mediaEl.pause();
  }
}

/** Which slot a show is — for the progress packets the dashboard splits by panel. */
const slotNameOf = (sh: ShowState): PlaybackSlot => (sh === shows.music ? 'music' : 'media');

/** A post is up on either stage → the background playlist gets out of the way. */
const duckBackgroundMusic = (): void => suspendMusic(true);

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
function demoSocketStub(): OverlaySocket {
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
  } as unknown as OverlaySocket;
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
  /** Seal catalog id, or 'none'. */
  seal: string;
  /** Frame catalog id, or 'none'. */
  frame: string;
}

/** Tint shown for each colourable seal in the demo, so the colour upgrade is visible with no picker. */
const SEAL_DEMO_COLORS: Record<string, string | undefined> = {
  'seal-core': '#5ad1ff',
  'seal-hourglass': '#7cff4f',
  'seal-swarm': '#c9b6ff',
  'seal-moons': '#ffb35c',
  'seal-keyring': '#ff8fd4',
  'seal-lanterns': '#ffd166',
  'seal-rings': '#a0e34a',
};

/** Same, for the colourable card effects — a non-default tint so the upgrade shows without a picker. */
const CARD_FX_DEMO_COLORS: Record<string, string | undefined> = {
  'card-butterflies': '#5ad1ff',
  'card-hextech': '#ffb43c',
  'card-claws': '#ff4d6a',
  'card-web': '#ff8fd4',
  'card-spellclash': '#8fb4ff',
  'card-runner': '#7cb8ff',
  'card-ripples': '#ffd166',
};

/** Second picker of the DUAL-colour effects, whose two sides are the whole point of the upgrade. */
const CARD_FX_DEMO_COLORS2: Record<string, string | undefined> = {
  'card-spellclash': '#ffb03c',
};

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
    senderFrame: st.frame !== 'none' ? st.frame : undefined,
    // A non-default tint on whichever frame is picked, so the frame colour upgrade is visible on the
    // stage without a picker; a frame with no colour upgrade simply ignores it.
    senderFrameColor: st.frame !== 'none' ? '#ff6ec7' : undefined,
    senderSeal: st.sender && st.seal !== 'none' ? st.seal : undefined,
    // Demo the seal colour upgrade on the colourable seals, without a picker. A table rather than a
    // ternary chain, so the next colourable seal is one line.
    senderSealColor: st.sender ? SEAL_DEMO_COLORS[st.seal] : undefined,
    senderCardEffectColor: CARD_FX_DEMO_COLORS[st.cardEffect],
    senderCardEffectColor2: CARD_FX_DEMO_COLORS2[st.cardEffect],
    senderEntrance: st.entrance !== 'none' ? st.entrance : undefined,
    // Demo a non-default tint so the colour upgrade is visible on the stage without a picker. Sent for
    // ANY entrance, not just the portal: the upgrade tints whichever one is equipped (see
    // entrance-portal-color), and a CSS entrance that has no colour simply ignores it.
    senderEntranceColor: st.entrance !== 'none' ? '#b57bff' : undefined,
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
    frame: 'none',
    // On by default: an entrance is invisible unless you happen to fire an alert while looking, so
    // the demo shows it rather than hiding it behind a click nobody knows to make.
    entrance: 'entrance-glitch',
    seal: 'seal-hourglass',
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
  ).forEach(([k, label]) =>
    mediaRow.appendChild(
      btn(label, () => {
        const payload = demoPayload(k, st);
        show(showFor(payload.slot), payload);
      }),
    ),
  );
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
      ...COSMETICS.filter((c) => c.type === 'entrance' && !c.upgrade).map(
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

  section('рамка');
  const frRow = document.createElement('div');
  frRow.className = 'row';
  // Registry-driven like the rows above; the per-frame colour upgrades are `upgrade` items and are
  // never worn as a frame, so they stay out (the demo tints whatever IS picked instead).
  const frButtons = (
    [
      ['none', 'Нет'],
      ...COSMETICS.filter((c) => c.type === 'frame' && !c.upgrade).map(
        (c) => [c.id, c.id.replace(/^frame-/, '')] as [string, string],
      ),
    ] as [string, string][]
  ).map(([val, label]) => {
    const b = btn(label, () => {
      st.frame = val;
      frButtons.forEach((x) => x.classList.toggle('on', x === b));
    });
    if (val === st.frame) b.classList.add('on');
    frRow.appendChild(b);
    return b;
  });
  panel.appendChild(frRow);

  section('печать');
  const sealRow = document.createElement('div');
  sealRow.className = 'row';
  // Registry-driven like the rows above: a new seal shows up here for free (id sans 'seal-' prefix).
  const sealButtons = (
    [
      ['none', 'Нет'],
      // `upgrade` items (the per-seal colours) render nothing and are never worn as a seal — left in,
      // each one adds a button that paints an empty box.
      ...COSMETICS.filter((c) => c.type === 'seal' && !c.upgrade).map(
        (c) => [c.id, c.id.replace(/^seal-/, '')] as [string, string],
      ),
    ] as [string, string][]
  ).map(([val, label]) => {
    const b = btn(label, () => {
      st.seal = val;
      sealButtons.forEach((x) => x.classList.toggle('on', x === b));
    });
    if (val === st.seal) b.classList.add('on');
    sealRow.appendChild(b);
    return b;
  });
  panel.appendChild(sealRow);

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

  panel.appendChild(
    btn(
      'Убрать с экрана',
      () => {
        finish(shows.media);
        finish(shows.music);
      },
      'clear',
    ),
  );

  document.body.appendChild(panel);
}

if (DEMO) mountDemoPanel();
// Demo the background music without a server: ?demo&music=<playlistId or URL>&mvol=40&mhide=1&mcompact=1
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
      display: q.has('mhide') ? 'hidden' : q.has('mcompact') ? 'compact' : 'full',
      // Layout — overridable via URL for look-and-feel checks (?mpos=…&msize=…&mmargin=…).
      position: (q.get('mpos') as OverlayPosition | null) ?? 'bottom-left',
      size: Number(q.get('msize')) || 20,
      margin: Number(q.get('mmargin')) || 2,
    });
  }
  // OBS autoplays; a browser tab won't until the page has been clicked. Kick the demo off on the
  // first click so the strip has something to actually play.
  const kick = (): void => {
    if (!musicPlayer) return;
    musicPlayer.playVideo();
    document.removeEventListener('click', kick);
  };
  document.addEventListener('click', kick);
  // Debug probe + reorder/command drivers for verification (demo only).
  (window as unknown as { __music: () => unknown }).__music = () => ({
    mode: musicMode,
    queue: musicIds,
    playlistId: musicPlaylistId,
    shuffle: musicShuffle,
    volume: musicVolume,
    effective: effectiveMusicVolume(),
    suspended: musicSuspended,
    userPaused: musicUserPaused,
    display: musicDisplay,
    quality: musicPlayer?.getPlaybackQuality?.() ?? null,
    hasPlayer: !!musicPlayer,
    currentId: currentMusicVideoId(),
    currentTime: musicPlayer?.getCurrentTime() ?? 0,
    wrapStyle: musicWrap?.getAttribute('style') ?? null,
  });
  (window as unknown as { __applyMusic: (c: MusicConfig) => void }).__applyMusic = applyMusicConfig;
  (window as unknown as { __musicCmd: (c: MusicCommand) => void }).__musicCmd = handleMusicCommand;
}
