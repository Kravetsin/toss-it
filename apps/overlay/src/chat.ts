import '@fontsource/jetbrains-mono';
// The pill's looks, next to the code that builds it — the two used to live in different files and
// different languages, and chat.html was 293 lines of CSS wrapped around 12 of markup.
import './overlay-base.css';
import './chat.css';
import { io, type Socket } from 'socket.io-client';
import {
  LEVEL_GLOW_FROM,
  applyEntrance,
  applyStyleMap,
  injectCosmeticsStyles,
  injectLevelStyles,
  levelTier,
  mountCardEffect,
  nickRender,
  toRoman,
  type ChatFragment,
  type ChatOverlayConfig,
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
/** Twitch emote CDN. Scale 1.0/2.0/3.0 = 28/56/112 px; pick the asset at or above the rendered
 *  size, since upscaling the 28px bitmap to a giant emote is visibly mushy. */
type EmoteScale = '1.0' | '2.0' | '3.0';
const emoteUrl = (id: string, scale: EmoteScale) =>
  `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/${scale}`;

/** Emote-only messages render big and shrink as the count grows (Telegram sticker logic).
 *  `step` drives the rendered height in chat.html; `scale` is the CDN asset that covers it. */
const BIG_EMOTE_LADDER: { upTo: number; step: string; scale: EmoteScale }[] = [
  { upTo: 1, step: '1', scale: '3.0' }, // 6em ≈ 114px
  { upTo: 3, step: '2', scale: '3.0' }, // 3.75em ≈ 71px
  { upTo: 6, step: '3', scale: '2.0' }, // 2.25em ≈ 43px
];

/** Fade-out animation length (keep in sync with .msg.leaving in chat.html). */
const FADE_ANIM_MS = 450;

/** How long existing messages take to slide up when a new one arrives. One curve for the
 *  column rise, the rail-tip extension (see #rail transition) and the marker split-off,
 *  so the thread tip and the marker travel as one. */
const RISE_MS = 460;
const RISE_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SERVER_URL = import.meta.env.DEV ? 'http://127.0.0.1:3000' : window.location.origin;
const chat = document.getElementById('chat')!;
const rail = document.getElementById('rail')!;

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

/** Pick the ladder step for a message, or null to keep emotes inline at normal size.
 *  Any non-blank text disqualifies the message — only the spaces between emotes are ignored.
 *  Mentions (@user, e.g. a reply prefix) are transparent, so "@nick Kappa" still goes big. */
function bigEmoteStep(fragments: ChatFragment[]): (typeof BIG_EMOTE_LADDER)[number] | null {
  let emotes = 0;
  for (const f of fragments) {
    if (f.type === 'emote') emotes += 1;
    else if (f.type === 'mention') continue;
    else if (f.text.trim() !== '') return null;
  }
  if (emotes === 0) return null;
  return BIG_EMOTE_LADDER.find((s) => emotes <= s.upTo) ?? null;
}

/** Build the message body from fragments — text as text nodes, emotes as <img>.
 *  Never innerHTML: chat text is arbitrary user input and must not become markup. */
function renderFragments(parent: HTMLElement, fragments: ChatFragment[]): void {
  const big = bigEmoteStep(fragments);
  if (big) parent.dataset.big = big.step;
  for (const f of fragments) {
    if (f.type === 'emote') {
      const img = document.createElement('img');
      img.className = 'emote';
      img.src = emoteUrl(f.id, big?.scale ?? '1.0');
      img.alt = f.text;
      parent.appendChild(img);
    } else if (!big) {
      // In big mode the only text left is the padding between emotes; flex gap replaces it.
      parent.appendChild(document.createTextNode(f.text));
    }
  }
}

function renderMessage(msg: ChatOverlayMessage): void {
  const row = document.createElement('div');
  row.className = 'msg';
  row.dataset.id = msg.id;
  row.dataset.user = msg.userId;
  // Role-tinted message border (broadcaster/mod/vip) — colors live in chat.html.
  if (msg.role) row.dataset.role = msg.role;

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

  const color = msg.cosmetics?.nickColor ?? msg.twitchColor ?? DEFAULT_COLOR;

  // Thread marker: a tier-colored star for ranked viewers, a small nick-colored bead for
  // newcomers — the star is what marks an established viewer.
  if (tier) {
    const star = document.createElement('span');
    star.className = 'star';
    star.innerHTML = STAR_SVG; // constant, trusted markup — not user input
    row.appendChild(star);
  } else {
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.setProperty('--dot', color);
    row.appendChild(dot);
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
  // Native platform badges (mod/vip/sub…), pre-resolved to images by the server.
  for (const b of msg.badges ?? []) {
    const img = document.createElement('img');
    img.className = 'tw-badge';
    img.src = b.url;
    img.alt = b.title;
    nameLine.appendChild(img);
  }
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = msg.name;
  // Gradient only ramps from a Tossit nick color — never from the Twitch fallback, which the
  // viewer never picked a second stop against.
  const nick = nickRender({
    color,
    color2: msg.cosmetics?.nickColor ? (msg.cosmetics.nickColor2 ?? null) : null,
    flow: msg.cosmetics?.nickFlow ?? false,
    effect: msg.cosmetics?.nickEffect ?? null,
  });
  // split(): nickRender composes several classes (paint + flow + effect) and classList.add throws
  // on a string containing spaces.
  if (nick.className) name.classList.add(...nick.className.split(' '));
  applyStyleMap(name, nick.style);
  nameLine.appendChild(name);
  row.appendChild(nameLine);

  // Message bubble; card-effect particles render behind the text, clipped to the bubble.
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  // Particles render behind the text, clipped to the pill. `compact`: a pill is short, so the
  // trajectory crosses it and starts/ends outside. No teardown — the listeners live on the pill's
  // own particles and go when the row does.
  if (msg.cosmetics?.cardEffect)
    mountCardEffect(bubble, msg.cosmetics.cardEffect, 'overlayChat', true);
  // The bubble is what arrives, so the bubble wears the entrance. Unequipped leaves the chat's own
  // unfold-from-the-star running (see .bubble:not([data-fx]) in chat.html).
  applyEntrance(bubble, msg.cosmetics?.entrance, reduceMotion, msg.cosmetics?.entranceColor);
  // Reply indicator: a small "↳ @name" line above the body. The parent @mention is stripped from
  // the fragments server-side, so an emote-only reply still gigantizes below this line.
  if (msg.reply) {
    const replyTo = document.createElement('div');
    replyTo.className = 'reply-to';
    const arrow = document.createElement('span');
    arrow.className = 'reply-arrow';
    arrow.textContent = '↳';
    const who = document.createElement('span');
    who.className = 'reply-name';
    who.textContent = `@${msg.reply.name}`;
    replyTo.append(arrow, who);
    bubble.appendChild(replyTo);
  }
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
  const prevTip = lastTipY;
  updateRail();
  animateMarker(row, prevTip);
  fireWake(tier?.color ?? color);
  scheduleFade(row);
}

/**
 * A stardust line for a channel-points redemption. Deliberately language-neutral — name + "+N ⭐" +
 * the domain — so unregistered viewers still grasp they earned Tossit stardust. Reuses the chat's
 * thread/flow (marker, rise, fade); a one-shot particle burst greets it.
 */
function renderRedemption(ev: { name: string; dust: number }): void {
  const row = document.createElement('div');
  row.className = 'msg redeem';

  const star = document.createElement('span');
  star.className = 'star';
  star.innerHTML = STAR_SVG; // constant, trusted markup — not user input
  row.appendChild(star);

  const card = document.createElement('div');
  card.className = 'redeem-card';

  // One-shot stardust burst radiating from the star (positions randomized per particle).
  const fx = document.createElement('span');
  fx.className = 'redeem-fx';
  if (!reduceMotion) {
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('i');
      const a = Math.random() * Math.PI * 2;
      const d = 16 + Math.random() * 26;
      p.style.setProperty('--tx', `${Math.cos(a) * d}px`);
      p.style.setProperty('--ty', `${Math.sin(a) * d}px`);
      p.style.setProperty('--sz', `${2 + Math.random() * 3}px`);
      p.style.setProperty('--delay', `${Math.random() * 140}ms`);
      fx.appendChild(p);
    }
  }
  card.appendChild(fx);

  const text = document.createElement('span');
  text.className = 'redeem-text';
  const line = document.createElement('span');
  line.className = 'redeem-line';
  const name = document.createElement('b');
  name.className = 'redeem-name';
  name.textContent = ev.name;
  const amt = document.createElement('span');
  amt.className = 'redeem-amt';
  const num = document.createElement('span');
  num.textContent = `+${ev.dust}`;
  const icon = document.createElement('span');
  icon.className = 'redeem-star';
  icon.innerHTML = STAR_SVG; // constant, trusted markup — our brand star, not the ⭐ emoji
  amt.append(num, icon);
  line.append(name, amt);
  const brand = document.createElement('span');
  brand.className = 'redeem-brand';
  brand.textContent = 'toss-it.win';
  text.append(line, brand);
  card.appendChild(text);

  row.appendChild(card);
  row.dataset.ts = String(Date.now());
  chat.appendChild(row);
  while (chat.children.length > MAX_MESSAGES) chat.firstElementChild?.remove();

  smoothRise(row.offsetHeight, row);
  const prevTip = lastTipY;
  updateRail();
  animateMarker(row, prevTip);
  fireWake('#8df0cc');
  scheduleFade(row);
}

/** Y of the thread tip inside a row: the marker's center (name line's if somehow absent).
 *  offset* is used instead of rects so running FLIP transforms don't skew the numbers. */
function tipY(row: HTMLElement): number {
  const anchor =
    row.querySelector<HTMLElement>('.star, .dot') ?? row.querySelector<HTMLElement>('.name-line');
  if (!anchor) return row.offsetTop;
  return row.offsetTop + anchor.offsetTop + anchor.offsetHeight / 2;
}

/** Viewport Y of the thread tip after the last updateRail — where the next marker splits off. */
let lastTipY: number | null = null;

/** Re-fit the single thread line: from just above the oldest message down to the newest
 *  message's marker. Its CSS transition matches smoothRise, so it glides with the column. */
function updateRail(): void {
  const first = chat.querySelector<HTMLElement>('.msg');
  const last = chat.querySelector<HTMLElement>('.msg:last-of-type');
  if (!first || !last) {
    rail.style.opacity = '0';
    lastTipY = null;
    return;
  }
  // Overshoot 1em above the first row so the top-dissolve mask has room to fade.
  const top = first.offsetTop - parseFloat(getComputedStyle(chat).fontSize);
  const tip = tipY(last);
  rail.style.opacity = '1';
  rail.style.top = `${top}px`;
  rail.style.height = `${Math.max(0, tip - top)}px`;
  lastTipY = tip;
}

/** Entry: the new marker splits off the previous thread tip and glides to its spot, on the
 *  same curve the rail tip extends with — so the drawing thread is literally its trail. */
function animateMarker(row: HTMLElement, prevTip: number | null): void {
  if (reduceMotion) return;
  const marker = row.querySelector<HTMLElement>('.star, .dot');
  if (!marker) return;
  const font = parseFloat(getComputedStyle(chat).fontSize);
  // First message has no tip to split from — condense in place with a short drop.
  let fromY = prevTip === null ? -1.2 * font : prevTip - tipY(row);
  fromY = Math.max(-10 * font, Math.min(10 * font, fromY));
  marker.animate(
    [
      { opacity: 0, transform: `translateY(${fromY}px) scale(0.25) rotate(-60deg)` },
      { opacity: 1, offset: 0.3 },
      { opacity: 1, transform: 'translateY(0) scale(1) rotate(0deg)' },
    ],
    { duration: RISE_MS, easing: RISE_EASE, fill: 'backwards' },
  );
}

/** The hot stretch of thread just drawn behind the marker: glows, then cools into the line. */
function fireWake(color: string): void {
  if (reduceMotion) return;
  const w = document.createElement('div');
  w.className = 'wake';
  w.style.setProperty('--wake', color);
  w.addEventListener('animationend', () => w.remove());
  rail.appendChild(w);
}

/**
 * The column is bottom-anchored, so a new row snaps everything above it upward. FLIP that:
 * shift the whole column down by the added height, then animate back to 0 (existing rows glide
 * up). The new row is countered so it stays put and plays its own star/reveal entry.
 */
function smoothRise(delta: number, newRow: HTMLElement): void {
  if (reduceMotion || delta <= 0) return;
  chat.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
    duration: RISE_MS,
    easing: RISE_EASE,
  });
  newRow.animate([{ transform: `translateY(${-delta}px)` }, { transform: 'translateY(0)' }], {
    duration: RISE_MS,
    easing: RISE_EASE,
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
  window.setTimeout(() => {
    row.remove();
    updateRail();
  }, FADE_ANIM_MS);
}

function applyConfig(cfg: ChatOverlayConfig): void {
  // On :root so both #chat and #rail (a sibling) pick it up.
  document.documentElement.style.setProperty('--chat-font', `${cfg.fontSize}px`);
  fadeSeconds = cfg.fadeSeconds;
  // Per-element toggles are applied via CSS on the container (chat.css), so flipping one instantly
  // affects every message, old and new. Default on: only 'off' when explicitly false.
  chat.dataset.badges = cfg.showBadges === false ? 'off' : 'on';
  chat.dataset.roleBorders = cfg.roleBorders === false ? 'off' : 'on';
  // Level goes on the ROOT, not on #chat: the numeral is on both overlays now, so one switch has to
  // reach both — and the media overlay has no #chat to hang it on. See overlay-base.css.
  document.documentElement.dataset.level = cfg.showLevel === false ? 'off' : 'on';
  // Adapt already-visible messages to the new setting (schedule, cancel, or hide overdue).
  for (const row of Array.from(chat.children)) scheduleFade(row as HTMLElement);
  updateRail();
}

function removeMessage(messageId: string): void {
  chat.querySelector(`[data-id="${CSS.escape(messageId)}"]`)?.remove();
  updateRail();
}
function removeUser(userId: string): void {
  chat.querySelectorAll(`[data-user="${CSS.escape(userId)}"]`).forEach((el) => el.remove());
  updateRail();
}
function clearAll(): void {
  chat.replaceChildren();
  updateRail();
}

if (DEMO) {
  // ?font= / ?fade= / ?badges=0 / ?level=0 / ?roles=0 exercise config without a server.
  const q = new URLSearchParams(window.location.search);
  applyConfig({
    fontSize: Number(q.get('font')) || 19,
    fadeSeconds: Number(q.get('fade')) || 0,
    showBadges: q.get('badges') !== '0',
    showLevel: q.get('level') !== '0',
    roleBorders: q.get('roles') !== '0',
  });
  // Real, stable Twitch global-badge CDN URLs — just to exercise rendering without a server.
  const badge = (id: string, title: string) => ({
    url: `https://static-cdn.jtvnw.net/badges/v1/${id}/2`,
    title,
  });
  const BROADCASTER = badge('5527c58c-fb7d-422d-b71b-f309dcb85cc1', 'Broadcaster');
  const MODERATOR = badge('3267646d-33f0-4b17-b3df-f923a41db1d0', 'Moderator');
  const VIP = badge('b817aba4-fad8-49e2-b88a-7cc744dfa6ec', 'VIP');
  const SUB = badge('5d9f2208-5dd8-11e7-8513-2ff4adfae661', 'Subscriber');
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
      badges: [VIP],
      role: 'vip',
      fragments: [{ type: 'text', text: 'незарег, но уже с бейджем 👀' }],
    },
    {
      id: '3',
      userId: 'u3',
      name: 'Kravets',
      twitchColor: null,
      cosmetics: {
        nickColor: '#8df0cc',
        nickColor2: '#a78bfa',
        nickFlow: true,
        nickEffect: 'nick-glow',
        cardEffect: 'card-stardust',
      },
      isFounder: true,
      level: 8,
      badges: [BROADCASTER],
      role: 'broadcaster',
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
      badges: [MODERATOR],
      role: 'moderator',
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
      cosmetics: { cardEffect: 'card-sakura' },
      isFounder: false,
      level: 10,
      badges: [MODERATOR, VIP],
      role: 'moderator',
      fragments: [{ type: 'text', text: 'на этом канале с самого начала' }],
    },
    {
      id: '6',
      userId: 'u6',
      name: 'subfan',
      twitchColor: '#7ec8ff',
      cosmetics: { cardEffect: 'card-snow' },
      isFounder: false,
      level: 2,
      badges: [SUB],
      role: 'subscriber',
      fragments: [{ type: 'text', text: 'я на сабе уже 3 месяца 💜' }],
    },
    // Every card effect gets a pill: a chat message is the smallest surface any of them has to
    // survive, so the demo is where a too-big effect gets caught.
    {
      id: '10',
      userId: 'u10',
      name: 'thunderstruck',
      twitchColor: null,
      cosmetics: {
        nickColor: '#f5f3ff',
        nickColor2: '#7c3aed',
        nickFlow: true,
        nickEffect: 'nick-pulse',
        cardEffect: 'card-lightning',
      },
      isFounder: false,
      level: 8,
      fragments: [{ type: 'text', text: 'бахнуло знатно' }],
    },
    {
      id: '11',
      userId: 'u11',
      name: 'ember_fan',
      twitchColor: '#ffb86c',
      cosmetics: { cardEffect: 'card-embers' },
      isFounder: false,
      level: 3,
      fragments: [{ type: 'text', text: 'горит и не гаснет' }],
    },
    // Entrance, alone: no card effect, so the arrival is the only thing happening and a broken one
    // has nowhere to hide. It is a one-shot — watch the pill land, not the pill sitting there.
    {
      id: '13',
      userId: 'u13',
      name: 'ghost_in_the_wire',
      twitchColor: null,
      cosmetics: { nickColor: '#00f0ff', entrance: 'entrance-glitch' },
      isFounder: false,
      level: 6,
      fragments: [{ type: 'text', text: 'сигнал нестабилен, но я тут' }],
    },
    // ...and stacked with a card effect, because they are different axes and must not fight: the
    // arrival glitches, then the swarm carries on as if nothing happened.
    {
      id: '14',
      userId: 'u14',
      name: 'static_bloom',
      twitchColor: null,
      cosmetics: {
        nickColor: '#ff6ad5',
        nickEffect: 'nick-glow',
        cardEffect: 'card-sakura',
        entrance: 'entrance-glitch',
      },
      isFounder: false,
      level: 9,
      fragments: [{ type: 'text', text: 'помехи прошли, лепестки остались' }],
    },
    // Premium JS entrance: a portal opens and the whole pill drives out through it. A one-shot like
    // the others — watch the pill emerge, not the pill sitting there.
    {
      id: '15',
      userId: 'u15',
      name: 'starfall',
      twitchColor: null,
      cosmetics: { nickColor: '#8df0cc', entrance: 'entrance-portal', entranceColor: '#ff8a3d' },
      isFounder: false,
      level: 7,
      fragments: [{ type: 'text', text: 'вышел из портала ✨' }],
    },
    {
      id: '12',
      userId: 'u12',
      name: 'rainy',
      twitchColor: '#a9b8c9',
      cosmetics: { cardEffect: 'card-rain' },
      isFounder: false,
      level: 2,
      fragments: [{ type: 'text', text: 'дождь весь день' }],
    },
    // 7-9 walk the big-emote ladder: 1 → 6em, 2-3 → 3.75em, 4-6 → 2.25em.
    {
      id: '7',
      userId: 'u7',
      name: 'emote_only',
      twitchColor: '#f5a97f',
      cosmetics: null,
      isFounder: false,
      level: 4,
      fragments: [{ type: 'emote', id: '25', text: 'Kappa' }],
    },
    // Reply carrying only an emote — the @mention is a separate fragment, so it still goes big.
    {
      id: '7r',
      userId: 'u7r',
      name: 'replier',
      twitchColor: '#89dceb',
      cosmetics: null,
      isFounder: false,
      level: 3,
      reply: { name: 'emote_only' },
      fragments: [{ type: 'emote', id: '25', text: 'Kappa' }],
    },
    {
      id: '8',
      userId: 'u8',
      name: 'triple',
      twitchColor: '#a6e3a1',
      cosmetics: null,
      isFounder: false,
      level: 1,
      fragments: [
        { type: 'emote', id: '25', text: 'Kappa' },
        { type: 'text', text: ' ' },
        { type: 'emote', id: '354', text: '4Head' },
        { type: 'text', text: ' ' },
        { type: 'emote', id: '58765', text: 'NotLikeThis' },
      ],
    },
    {
      id: '9',
      userId: 'u9',
      name: 'spammer',
      twitchColor: '#cba6f7',
      cosmetics: null,
      isFounder: false,
      level: 6,
      fragments: [
        { type: 'emote', id: '25', text: 'Kappa' },
        { type: 'emote', id: '30259', text: 'HeyGuys' },
        { type: 'emote', id: '245', text: 'ResidentSleeper' },
        { type: 'emote', id: '41', text: 'Kreygasm' },
        { type: 'emote', id: '1902', text: 'Keepo' },
      ],
    },
  ];
  // Feed one message at a time on a loop so the entry animation is visible.
  // ?manual disables the loop; window.__push() steps by hand (animation debugging).
  let i = 0;
  const push = () => {
    renderMessage({ ...demo[i % demo.length]!, id: `d${i}` });
    i += 1;
  };
  const redeem = () =>
    renderRedemption({
      name: ['stardust_fan', 'new_viewer', 'kravets'][Math.floor(Math.random() * 3)]!,
      dust: [50, 100, 250][Math.floor(Math.random() * 3)]!,
    });
  (window as unknown as Record<string, unknown>).__push = push;
  (window as unknown as Record<string, unknown>).__redeem = redeem;
  push();
  if (!q.has('manual')) {
    window.setInterval(push, 1900);
    window.setInterval(redeem, 6100); // periodic stardust line among the chatter
  }
} else {
  const socket: Socket<ServerToOverlayEvents, OverlayToServerEvents> = io(SERVER_URL, {
    query: { role: 'overlay', token: token ?? '' },
  });
  socket.on('connect', () => console.log('[chat-overlay] connected'));
  socket.on('chat:config', applyConfig);
  socket.on('chat:message', renderMessage);
  socket.on('chat:redemption', renderRedemption);
  socket.on('chat:delete', removeMessage);
  socket.on('chat:clearUser', removeUser);
  socket.on('chat:clear', clearAll);
}
