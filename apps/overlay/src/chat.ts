import '@fontsource/jetbrains-mono';
import { io, type Socket } from 'socket.io-client';
import {
  LEVEL_GLOW_FROM,
  cardEffectClass,
  injectCosmeticsStyles,
  injectLevelStyles,
  levelTier,
  makeGroundGlows,
  makeParticles,
  nickEffectClass,
  particleCount,
  toRoman,
  type ChatFragment,
  type ChatOverlayMessage,
  type OverlayToServerEvents,
  type ServerToOverlayEvents,
} from '@tmw/shared';

// Cosmetic effect CSS is injected from the shared registry (single source across web + overlay).
injectCosmeticsStyles();
injectLevelStyles();

// Founder = sparkles glyph before the name (matches web UserBadges / the media overlay).
const FOUNDER_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>';

// Trail marker: the brand 4-point spark (same glyph as StarMark / stardust).
const STAR_SVG =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"/></svg>';

const DEFAULT_COLOR = '#8df0cc';
const MAX_MESSAGES = 40;
/** Small Twitch emote (28px) — matches the ~19px line height. */
const emoteUrl = (id: string) =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/1.0`;

/** Fade-out animation length (keep in sync with .msg.leaving in chat.html). */
const FADE_ANIM_MS = 450;

/** How long existing messages take to slide up when a new one arrives. */
const RISE_MS = 460;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SERVER_URL = import.meta.env.DEV ? 'http://127.0.0.1:3000' : window.location.origin;
const chat = document.getElementById('chat')!;

// Seconds a message lives before fading; 0 = keep. Updated by chat:config.
let fadeSeconds = 0;
// Pending fade timer per message, so a config change can reschedule/cancel them.
const fadeTimers = new WeakMap<HTMLElement, number>();

const DEMO = import.meta.env.DEV && new URLSearchParams(window.location.search).has('demo');
const token = new URLSearchParams(window.location.search).get('token');
if (!DEMO && !token) {
  chat.innerHTML =
    '<div style="font:16px system-ui;color:#f55">Нет токена: добавь ?token=&lt;overlay token&gt; к URL</div>';
  throw new Error('chat overlay token missing');
}

/** Build the message body from fragments — text as text nodes, emotes as <img>.
 *  Never innerHTML: chat text is arbitrary user input and must not become markup. */
function renderFragments(parent: HTMLElement, fragments: ChatFragment[]): void {
  for (const f of fragments) {
    if (f.type === 'emote') {
      const img = document.createElement('img');
      img.className = 'emote';
      img.src = emoteUrl(f.id);
      img.alt = f.text;
      parent.appendChild(img);
    } else {
      parent.appendChild(document.createTextNode(f.text));
    }
  }
}

/** Particle layer for card cosmetics; rendered behind the text, clipped to the pill. */
function addCardEffect(row: HTMLElement, effect: string): void {
  const cls = cardEffectClass(effect);
  // Fewer particles than the full media card — chat pills are small.
  const count = particleCount(effect, 'overlayChat');
  if (!cls || !count) return;
  // `compact`: pills are short, so use the compact trajectory (crosses the row, clipped outside).
  const layer = document.createElement('div');
  layer.className = `card-fx ${cls} compact`;
  const applyStyles = (el: HTMLElement, styles: Record<string, string>) => {
    for (const [k, v] of Object.entries(styles)) {
      if (k.startsWith('--')) el.style.setProperty(k, v);
      else (el.style as unknown as Record<string, string>)[k] = v;
    }
  };
  const particles = makeParticles(effect, count);
  for (const ps of particles) {
    const p = document.createElement('span');
    p.className = 'p';
    applyStyles(p, ps);
    layer.appendChild(p);
  }
  // Ground glows: thin lines phased to each particle's bottom-crossing (compact keyframes).
  for (const gs of makeGroundGlows(effect, particles)) {
    const g = document.createElement('span');
    g.className = 'g';
    applyStyles(g, gs);
    layer.appendChild(g);
  }
  row.appendChild(layer);
}

function renderMessage(msg: ChatOverlayMessage): void {
  const row = document.createElement('div');
  row.className = 'msg';
  row.dataset.id = msg.id;
  row.dataset.user = msg.userId;

  // Level: rarity tint on the star marker + a Roman numeral before the name; glow kicks in from
  // level 6 up. The trail line itself stays mint — the brand thread through the whole chat.
  const tier = msg.level ? levelTier(msg.level) : null;
  if (tier) {
    row.dataset.tier = '';
    if (tier.iris) row.dataset.iris = ''; // Eternal (10): iridescent shimmer on rail + numeral.
    row.style.setProperty('--tier', tier.color);
    row.style.setProperty(
      '--tier-glow',
      msg.level! >= LEVEL_GLOW_FROM ? tier.color : 'transparent',
    );
  }

  // Star marker rides the trail line and drops in to reveal the message — but only for ranked
  // viewers. A newcomer (no level) gets no star: the star is what marks an established viewer.
  if (tier) {
    const star = document.createElement('span');
    star.className = 'star';
    star.innerHTML = STAR_SVG; // constant, trusted markup — not user input
    row.appendChild(star);
  }

  // Name on its own line above the message, so long pastes never wrap around it.
  const nameLine = document.createElement('div');
  nameLine.className = 'name-line';
  if (tier) {
    const ln = document.createElement('span');
    ln.className = 'lvl-num';
    ln.textContent = toRoman(msg.level!);
    nameLine.appendChild(ln);
  }
  if (msg.isFounder) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.innerHTML = FOUNDER_SVG; // constant, trusted markup — not user input
    nameLine.appendChild(badge);
  }
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = msg.name;
  const color = msg.cosmetics?.nickColor ?? msg.twitchColor ?? DEFAULT_COLOR;
  name.style.color = color;
  const nickFx = msg.cosmetics?.nickEffect ? nickEffectClass(msg.cosmetics.nickEffect) : '';
  if (nickFx) {
    name.classList.add(nickFx);
    name.style.setProperty('--nick-glow', color);
  }
  nameLine.appendChild(name);
  row.appendChild(nameLine);

  // Message bubble; card-effect particles render behind the text, clipped to the bubble.
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  if (msg.cosmetics?.cardEffect) addCardEffect(bubble, msg.cosmetics.cardEffect);
  const body = document.createElement('span');
  body.className = 'body';
  renderFragments(body, msg.fragments);
  bubble.appendChild(body);
  row.appendChild(bubble);
  row.dataset.ts = String(Date.now());
  chat.appendChild(row);
  // Cap the DOM: drop the oldest messages from the top.
  while (chat.children.length > MAX_MESSAGES) chat.firstElementChild?.remove();

  // Smooth-rise: existing messages slide up by the new row's height instead of snapping.
  smoothRise(row.offsetHeight, row);
  scheduleFade(row);
}

/**
 * The column is bottom-anchored, so a new row snaps everything above it upward. FLIP that:
 * shift the whole column down by the added height, then animate back to 0 (existing rows glide
 * up). The new row is countered so it stays put and plays its own star/reveal entry.
 */
function smoothRise(delta: number, newRow: HTMLElement): void {
  if (reduceMotion || delta <= 0) return;
  // Same curve as the star descent — one coherent, even glide, not a fast snap-settle.
  const ease = 'cubic-bezier(0.4, 0, 0.2, 1)';
  chat.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
    duration: RISE_MS,
    easing: ease,
  });
  newRow.animate([{ transform: `translateY(${-delta}px)` }, { transform: 'translateY(0)' }], {
    duration: RISE_MS,
    easing: ease,
  });
}

/** (Re)schedule a message's fade from the CURRENT fadeSeconds, accounting for its age.
 *  Called on render and whenever the config changes — so toggling the slider adapts
 *  messages that were shown while auto-hide was off. */
function scheduleFade(row: HTMLElement): void {
  const existing = fadeTimers.get(row);
  if (existing !== undefined) {
    clearTimeout(existing);
    fadeTimers.delete(row);
  }
  if (fadeSeconds <= 0 || row.classList.contains('leaving')) return;
  const age = (Date.now() - Number(row.dataset.ts ?? Date.now())) / 1000;
  const remaining = Math.max(0, fadeSeconds - age);
  fadeTimers.set(
    row,
    window.setTimeout(() => fadeOut(row), remaining * 1000),
  );
}

function fadeOut(row: HTMLElement): void {
  fadeTimers.delete(row);
  if (!row.isConnected || row.classList.contains('leaving')) return;
  row.classList.add('leaving');
  window.setTimeout(() => row.remove(), FADE_ANIM_MS);
}

function applyConfig(cfg: { fontSize: number; fadeSeconds: number }): void {
  chat.style.setProperty('--chat-font', `${cfg.fontSize}px`);
  fadeSeconds = cfg.fadeSeconds;
  // Adapt already-visible messages to the new setting (schedule, cancel, or hide overdue).
  for (const row of Array.from(chat.children)) scheduleFade(row as HTMLElement);
}

function removeMessage(messageId: string): void {
  chat.querySelector(`[data-id="${CSS.escape(messageId)}"]`)?.remove();
}
function removeUser(userId: string): void {
  chat.querySelectorAll(`[data-user="${CSS.escape(userId)}"]`).forEach((el) => el.remove());
}
function clearAll(): void {
  chat.replaceChildren();
}

if (DEMO) {
  // ?font= / ?fade= let us exercise config without a server.
  const q = new URLSearchParams(window.location.search);
  applyConfig({
    fontSize: Number(q.get('font')) || 19,
    fadeSeconds: Number(q.get('fade')) || 0,
  });
  const demo: ChatOverlayMessage[] = [
    {
      id: '1',
      userId: 'u1',
      name: 'newbie_guy',
      twitchColor: '#9ab0ad',
      cosmetics: null,
      isFounder: false,
      level: 0,
      fragments: [{ type: 'text', text: 'привет, впервые тут (без звезды)' }],
    },
    {
      id: '2',
      userId: 'u2',
      name: 'darkblane',
      twitchColor: '#ff7ac6',
      cosmetics: null,
      isFounder: false,
      level: 3,
      fragments: [{ type: 'text', text: 'незарег, но уже с бейджем 👀' }],
    },
    {
      id: '3',
      userId: 'u3',
      name: 'Kravets',
      twitchColor: null,
      cosmetics: { nickColor: '#8df0cc', nickEffect: 'nick-glow', cardEffect: 'card-stardust' },
      isFounder: true,
      level: 8,
      fragments: [
        { type: 'text', text: 'смотри какой эмоут ' },
        { type: 'emote', id: '25', text: 'Kappa' },
      ],
    },
    {
      id: '4',
      userId: 'u4',
      name: 'Kravetsin',
      twitchColor: '#c9a0ff',
      cosmetics: { cardEffect: 'card-levitation' },
      isFounder: true,
      level: 5,
      fragments: [
        {
          type: 'text',
          text: 'а это длинное сообщение чтобы проверить как ведёт себя иконка и текст когда всё переносится на несколько строк подряд ',
        },
      ],
    },
    {
      id: '5',
      userId: 'u5',
      name: 'oldtimer',
      twitchColor: '#f5d76e',
      cosmetics: null,
      isFounder: false,
      level: 10,
      fragments: [{ type: 'text', text: 'на этом канале с самого начала' }],
    },
  ];
  // Feed one message at a time on a loop so the star-drop entry animation is visible.
  let i = 0;
  const push = () => {
    renderMessage({ ...demo[i % demo.length]!, id: `d${i}` });
    i += 1;
  };
  push();
  window.setInterval(push, 1900);
} else {
  const socket: Socket<ServerToOverlayEvents, OverlayToServerEvents> = io(SERVER_URL, {
    query: { role: 'overlay', token: token ?? '' },
  });
  socket.on('connect', () => console.log('[chat-overlay] connected'));
  socket.on('chat:config', applyConfig);
  socket.on('chat:message', renderMessage);
  socket.on('chat:delete', removeMessage);
  socket.on('chat:clearUser', removeUser);
  socket.on('chat:clear', clearAll);
}
