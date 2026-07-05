import '@fontsource/jetbrains-mono';
import { io, type Socket } from 'socket.io-client';
import type {
  ChatFragment,
  ChatOverlayMessage,
  OverlayToServerEvents,
  ServerToOverlayEvents,
} from '@tmw/shared';

// Founder = sparkles glyph before the name (matches web UserBadges / the media overlay).
const FOUNDER_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>';

const DEFAULT_COLOR = '#8df0cc';
const MAX_MESSAGES = 40;
/** Small Twitch emote (28px) — matches the ~19px line height. */
const emoteUrl = (id: string) =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/1.0`;

const SERVER_URL = import.meta.env.DEV ? 'http://127.0.0.1:3000' : window.location.origin;
const chat = document.getElementById('chat')!;

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

function renderMessage(msg: ChatOverlayMessage): void {
  const row = document.createElement('div');
  row.className = 'msg';
  row.dataset.id = msg.id;
  row.dataset.user = msg.userId;

  if (msg.isFounder) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.innerHTML = FOUNDER_SVG; // constant, trusted markup — not user input
    row.appendChild(badge);
  }

  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = msg.name;
  const color = msg.cosmetics?.nickColor ?? msg.twitchColor ?? DEFAULT_COLOR;
  name.style.color = color;
  if (msg.cosmetics?.nickEffect === 'nick-glow') {
    name.classList.add('fx-glow');
    name.style.setProperty('--nick-glow', color);
  }
  row.appendChild(name);

  const sep = document.createElement('span');
  sep.className = 'sep';
  sep.textContent = ':';
  row.appendChild(sep);

  const body = document.createElement('span');
  renderFragments(body, msg.fragments);
  row.appendChild(body);

  chat.appendChild(row);
  // Cap the DOM: drop the oldest messages from the top.
  while (chat.children.length > MAX_MESSAGES) chat.firstElementChild?.remove();
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
      cosmetics: { nickColor: '#8df0cc', nickEffect: 'nick-glow' },
      isFounder: true,
      fragments: [
        { type: 'text', text: 'смотри какой эмоут ' },
        { type: 'emote', id: '25', text: 'Kappa' },
      ],
    },
  ];
  demo.forEach(renderMessage);
} else {
  const socket: Socket<ServerToOverlayEvents, OverlayToServerEvents> = io(SERVER_URL, {
    query: { role: 'overlay', token: token ?? '' },
  });
  socket.on('connect', () => console.log('[chat-overlay] connected'));
  socket.on('chat:message', renderMessage);
  socket.on('chat:delete', removeMessage);
  socket.on('chat:clearUser', removeUser);
  socket.on('chat:clear', clearAll);
}
