import '@fontsource/jetbrains-mono';
import { io, type Socket } from 'socket.io-client';
import {
  cardEffectClass,
  injectCosmeticsStyles,
  makeParticles,
  nickEffectClass,
  particleCount,
  type ChatFragment,
  type ChatOverlayMessage,
  type OverlayToServerEvents,
  type ServerToOverlayEvents,
} from '@tmw/shared';

// Cosmetic effect CSS is injected from the shared registry (single source across web + overlay).
injectCosmeticsStyles();

// Founder = sparkles glyph before the name (matches web UserBadges / the media overlay).
const FOUNDER_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>';

const DEFAULT_COLOR = '#8df0cc';
const MAX_MESSAGES = 40;
/** Small Twitch emote (28px) — matches the ~19px line height. */
const emoteUrl = (id: string) =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/1.0`;

/** Fade-out animation length (keep in sync with .msg.leaving in chat.html). */
const FADE_ANIM_MS = 450;

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
  for (const ps of makeParticles(effect, count)) {
    const p = document.createElement('span');
    p.className = 'p';
    for (const [k, v] of Object.entries(ps)) {
      if (k.startsWith('--')) p.style.setProperty(k, v);
      else (p.style as unknown as Record<string, string>)[k] = v;
    }
    layer.appendChild(p);
  }
  row.appendChild(layer);
}

function renderMessage(msg: ChatOverlayMessage): void {
  const row = document.createElement('div');
  row.className = 'msg';
  row.dataset.id = msg.id;
  row.dataset.user = msg.userId;

  // Card effect first: it's the background particle layer, under .content.
  if (msg.cosmetics?.cardEffect) addCardEffect(row, msg.cosmetics.cardEffect);

  const content = document.createElement('span');
  content.className = 'content';

  // Founder icon + name + colon stay together on the name's line (nowrap head).
  const head = document.createElement('span');
  head.className = 'head';
  if (msg.isFounder) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.innerHTML = FOUNDER_SVG; // constant, trusted markup — not user input
    head.appendChild(badge);
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
  head.appendChild(name);
  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = ':';
  head.appendChild(sep);
  content.appendChild(head);

  const body = document.createElement('span');
  renderFragments(body, msg.fragments);
  content.appendChild(body);

  row.appendChild(content);
  row.dataset.ts = String(Date.now());
  chat.appendChild(row);
  // Cap the DOM: drop the oldest messages from the top.
  while (chat.children.length > MAX_MESSAGES) chat.firstElementChild?.remove();

  scheduleFade(row);
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
      name: 'darkblane',
      twitchColor: '#ff7ac6',
      cosmetics: null,
      isFounder: false,
      fragments: [{ type: 'text', text: 'привет всем!' }],
    },
    {
      id: '2',
      userId: 'u2',
      name: 'Kravets',
      twitchColor: null,
      cosmetics: { nickColor: '#8df0cc', nickEffect: 'nick-glow', cardEffect: 'card-stardust' },
      isFounder: true,
      fragments: [
        { type: 'text', text: 'смотри какой эмоут ' },
        { type: 'emote', id: '25', text: 'Kappa' },
      ],
    },
    {
      id: '3',
      userId: 'u3',
      name: 'Kravetsin',
      twitchColor: '#c9a0ff',
      cosmetics: { cardEffect: 'card-levitation' },
      isFounder: true,
      fragments: [
        {
          type: 'text',
          text: 'а это длинное сообщение чтобы проверить как ведёт себя иконка и текст когда всё переносится на несколько строк подряд ',
        },
      ],
    },
  ];
  demo.forEach(renderMessage);
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
