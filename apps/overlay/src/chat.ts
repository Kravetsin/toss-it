import '@fontsource/jetbrains-mono';
// The pill's looks, next to the code that builds it — the two used to live in different files and
// different languages, and chat.html was 293 lines of CSS wrapped around 12 of markup.
import './overlay-base.css';
import './chat.css';
import { connectOverlay, overlayServerUrl } from './socket';
import {
  LEVEL_GLOW_FROM,
  applyEntrance,
  applyStyleMap,
  frameEffectClass,
  frameTintVar,
  injectCosmeticsStyles,
  injectLevelStyles,
  levelTier,
  mountCardEffect,
  nickRender,
  sealEffectClass,
  sealMarkup,
  toRoman,
  type ChatFragment,
  type ChatOverlayConfig,
  type ChatOverlayMessage,
  type ChatSystemEvent,
} from '@tmw/shared';

// Cosmetic effect CSS is injected from the shared registry (single source across web + overlay).
injectCosmeticsStyles();
injectLevelStyles();

// Founder = the Tossit emblem before the name (matches web BrandSeal / the media overlay).
const FOUNDER_SVG =
  '<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="10.6" fill="#0c1a15" stroke="currentColor" stroke-width="1.3"/><path transform="translate(2.4 2.4) scale(0.8)" fill="currentColor" d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"/></svg>';

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

const SERVER_URL = overlayServerUrl();
const chat = document.getElementById('chat')!;
const rail = document.getElementById('rail')!;

// Compact rows: the nick rides the message's first line, the way the bot-answer card lays out.
// Updated by chat:config; the markup differs, so a change lands on the NEXT message, not on the
// ones already on screen (they scroll off within seconds of chat).
let compact = false;
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
    } else if (f.type === 'cheermote') {
      // Art plus the amount in the tier's own color. The number never hides behind the art: it is
      // what the viewer actually paid. Unresolved art (catalog fetch failed) leaves "Cheer100".
      if (f.url) {
        const img = document.createElement('img');
        img.className = 'emote';
        img.src = f.url;
        img.alt = f.text;
        parent.appendChild(img);
      }
      const amount = document.createElement('span');
      amount.className = 'bits';
      if (f.color) amount.style.color = f.color;
      amount.textContent = f.url ? String(f.bits) : f.text;
      parent.appendChild(amount);
    } else if (!big) {
      // In big mode the only text left is the padding between emotes; flex gap replaces it.
      parent.appendChild(document.createTextNode(f.text));
    }
  }
}

/** The sender's seal as a standalone element: the gutter object on a normal row, an item held at
 *  the end of the name line on a compact one. */
function buildSeal(cosmetics: ChatOverlayMessage['cosmetics'], cls: string): HTMLElement {
  const seal = document.createElement('span');
  seal.className = `seal ${cls}`;
  // Constant markup from the cosmetics registry â not user input (same rule as the star glyph).
  seal.innerHTML = sealMarkup(cosmetics?.seal);
  // Colourable seals read their tint from --seal-tint; a plain seal has no entry.
  const sealColor = cosmetics?.seal ? cosmetics.sealColors?.[cosmetics.seal] : undefined;
  if (sealColor) seal.style.setProperty('--seal-tint', sealColor);
  return seal;
}

function renderMessage(msg: ChatOverlayMessage): void {
  const row = document.createElement('div');
  row.className = 'msg';
  row.dataset.id = msg.id;
  row.dataset.user = msg.userId;
  // Role-tinted message border (broadcaster/mod/vip) — colors live in chat.html.
  if (msg.role) row.dataset.role = msg.role;
  // Notices (sub/raid/watch streak…) are chat rows with an event line on top. The kind lands on the
  // row so the styling can branch per event without touching this function.
  if (msg.notice) row.dataset.notice = msg.notice.type;
  // Emphasis is the same idea for the message itself: bits, a paid highlight, a newcomer's first
  // line. Both feed the row's --event accent, so they share the border and caption treatment.
  if (msg.emphasis) row.dataset.emphasis = msg.emphasis.kind;

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

  // Rank paint for the compact layout's left edge, which stands in for the marker below: a tier
  // color for ranked viewers, the nick's own for newcomers — the same split the star/bead makes.
  // An event row is left alone: its edge takes the event accent from CSS, and an inline property
  // set here would outrank that rule.
  if (!msg.notice && !msg.emphasis) row.style.setProperty('--edge', tier?.color ?? color);

  // Thread marker. A notice hands the thread to the EVENT: the mark's silhouette is what says
  // "raid" or "watch streak" at a glance, and the author's rank still shows as the numeral on the
  // name line. Otherwise: a tier-colored star for ranked viewers, a small nick-colored bead for
  // newcomers — the star is what marks an established viewer. Compact has no gutter and no thread:
  // the bubble's left edge carries the rank instead (chat.css).
  if (!compact) {
    if (msg.notice) {
      const mark = document.createElement('span');
      mark.className = 'mark'; // shape and color come from data-notice (chat.css)
      row.appendChild(mark);
    } else if (tier) {
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
  }

  const sealCls = sealEffectClass(msg.cosmetics?.seal);
  const seal = sealCls ? buildSeal(msg.cosmetics, sealCls) : null;

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
  // Compact puts the name INSIDE the bubble (added below, right before the body) so it shares the
  // first line with the text. Otherwise it is its own line above the bubble.
  if (compact && seal) nameLine.appendChild(seal);
  if (!compact) row.appendChild(nameLine);

  // Message bubble; card-effect particles render behind the text, clipped to the bubble.
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const frameCls = frameEffectClass(msg.cosmetics?.frame);
  if (frameCls) bubble.classList.add(frameCls);
  // Colourable frames read their tint from --frame-rgb; an untinted one keeps the module's mint.
  const frameTint = frameTintVar(
    msg.cosmetics?.frame ? msg.cosmetics.frameColors?.[msg.cosmetics.frame] : null,
  );
  if (frameTint) bubble.style.setProperty('--frame-rgb', frameTint);
  // Particles render behind the text, clipped to the pill. `compact`: a pill is short, so the
  // trajectory crosses it and starts/ends outside. No teardown — the listeners live on the pill's
  // own particles and go when the row does.
  if (msg.cosmetics?.cardEffect)
    mountCardEffect(
      bubble,
      msg.cosmetics.cardEffect,
      'overlayChat',
      true,
      msg.cosmetics.cardEffectColors?.[msg.cosmetics.cardEffect] ?? undefined,
      msg.cosmetics.cardEffectColors2?.[msg.cosmetics.cardEffect] ?? undefined,
    );
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
  // The caption, above whatever the viewer typed: what the event was, or why this line stands out.
  // Already composed in the channel's language server-side — the overlay only places it.
  const captionText = msg.notice?.text || msg.emphasis?.text;
  if (captionText) {
    const caption = document.createElement('div');
    caption.className = 'caption';
    caption.textContent = captionText;
    bubble.appendChild(caption);
  }
  if (compact) bubble.appendChild(nameLine);
  const body = document.createElement('span');
  body.className = 'body';
  renderFragments(body, msg.fragments);
  // Most notices carry no text of their own — an empty body would add a blank line under the event.
  if (msg.fragments.length > 0 || !msg.notice) bubble.appendChild(body);
  // The seal rides WITH the bubble, not with the row: the name line's height varies (numeral,
  // badges), so anything positioned from the row's top drifts off the first line. Anchoring to a
  // wrapper that starts exactly where the bubble starts makes the offset a constant. Compact has
  // no gutter to spare — the seal went into the name line above.
  if (seal && !compact) {
    const bodyRow = document.createElement('div');
    bodyRow.className = 'body-row';
    bodyRow.append(seal, bubble);
    row.appendChild(bodyRow);
  } else {
    row.appendChild(bubble);
  }
  appendRow(row, tier?.color ?? color);
}

/** Shared tail for every row kind: cap the column, rise, re-fit the thread, schedule the fade. */
function appendRow(row: HTMLElement, wakeColor: string): void {
  row.dataset.ts = String(Date.now());
  chat.appendChild(row);
  // Cap the DOM: drop the oldest messages from the top.
  while (chat.children.length > MAX_MESSAGES) chat.firstElementChild?.remove();

  // Smooth-rise: existing messages slide up by the new row's height instead of snapping.
  smoothRise(row.offsetHeight, row);
  const prevTip = lastTipY;
  updateRail();
  animateMarker(row, prevTip);
  // An event's thread flash matches its accent. That accent lives in CSS (one place per kind), so
  // read it back off the row rather than keeping a second copy of the palette here.
  fireWake(
    row.dataset.notice || row.dataset.emphasis
      ? getComputedStyle(row).getPropertyValue('--event').trim() || wakeColor
      : wakeColor,
  );
  scheduleFade(row);
}

/** The brand star as a standalone inline glyph (amount markers on the redemption/system lines). */
function starIcon(className: string): HTMLElement {
  const icon = document.createElement('span');
  icon.className = className;
  icon.innerHTML = STAR_SVG; // constant, trusted markup — our brand star, not the ⭐ emoji
  return icon;
}

/**
 * The bot's answer to a chat command (!balance). Quieter than a redemption on purpose: this is a
 * reply, not an event. It must not read as a viewer's own message either, hence its own card
 * rather than a bubble — nobody should think the bot is a chatter.
 */
function renderSystem(line: ChatSystemEvent): void {
  const row = document.createElement('div');
  row.className = 'msg system';

  // Star stays mint: it is the rail marker, part of the "bot answer" identity, not the asker's.
  // Compact has no gutter to hold it, and on the card itself it would read as a blot — there the
  // row's left edge does the marking (chat.css).
  if (!compact) {
    const star = document.createElement('span');
    star.className = 'star';
    star.innerHTML = STAR_SVG; // constant, trusted markup — not user input
    row.appendChild(star);
  }

  const card = document.createElement('div');
  card.className = 'sys-card';
  // Card-effect particles on their OWN clipped layer, not on the card: the card must stay
  // non-clipping so the nick's and star's glows can spill past its edge, but the particles still
  // have to be contained to the pill. `compact`: a card is short, so trajectories cross it.
  if (line.cosmetics?.cardEffect) {
    const fx = document.createElement('div');
    fx.className = 'sys-fx';
    mountCardEffect(
      fx,
      line.cosmetics.cardEffect,
      'overlayChat',
      true,
      line.cosmetics.cardEffectColors?.[line.cosmetics.cardEffect] ?? undefined,
      line.cosmetics.cardEffectColors2?.[line.cosmetics.cardEffect] ?? undefined,
    );
    card.appendChild(fx);
  }

  const head = document.createElement('span');
  head.className = 'sys-line';
  // Founder badge + nick travel together, centered, so the badge tracks the name while the row
  // itself stays baseline-aligned with the amount number.
  const who = document.createElement('span');
  who.className = 'sys-who';
  if (line.isFounder) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.innerHTML = FOUNDER_SVG; // constant, trusted markup — not user input
    who.appendChild(badge);
  }
  const name = document.createElement('span');
  name.className = 'sys-name';
  name.textContent = `@${line.name}`;
  // The asker's nick paint — the one cosmetic the card carries. Same fallback ladder as a chat
  // message: Tossit nick color, else their Twitch color, else brand mint. Gradient only ramps from
  // a real Tossit color (never off the Twitch fallback, which has no second stop chosen for it).
  const color = line.cosmetics?.nickColor ?? line.twitchColor ?? DEFAULT_COLOR;
  const nick = nickRender({
    color,
    color2: line.cosmetics?.nickColor ? (line.cosmetics.nickColor2 ?? null) : null,
    flow: line.cosmetics?.nickFlow ?? false,
    effect: line.cosmetics?.nickEffect ?? null,
  });
  if (nick.className) name.classList.add(...nick.className.split(' '));
  applyStyleMap(name, nick.style);
  who.appendChild(name);
  head.appendChild(who);
  if (line.text) {
    const label = document.createElement('span');
    label.className = 'sys-text';
    label.textContent = line.text;
    head.appendChild(label);
  }
  if (line.dust !== undefined) {
    const amt = document.createElement('span');
    amt.className = 'sys-amt';
    const num = document.createElement('span');
    num.textContent = String(line.dust);
    amt.append(num, starIcon('sys-star'));
    head.appendChild(amt);
  }
  card.appendChild(head);
  if (line.hint) {
    const hint = document.createElement('span');
    hint.className = 'sys-hint';
    hint.textContent = line.hint;
    card.appendChild(hint);
  }

  row.appendChild(card);
  appendRow(row, '#8df0cc');
}

/**
 * A stardust line for a channel-points redemption. Deliberately language-neutral — name + "+N ⭐" +
 * the domain — so unregistered viewers still grasp they earned Tossit stardust. Reuses the chat's
 * thread/flow (marker, rise, fade); a one-shot particle burst greets it.
 */
function renderRedemption(ev: { name: string; dust: number }): void {
  const row = document.createElement('div');
  row.className = 'msg redeem';

  // Same as the bot answer above: no gutter in compact, so no marker.
  if (!compact) {
    const star = document.createElement('span');
    star.className = 'star';
    star.innerHTML = STAR_SVG; // constant, trusted markup — not user input
    row.appendChild(star);
  }

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
  amt.append(num, starIcon('redeem-star'));
  line.append(name, amt);
  const brand = document.createElement('span');
  brand.className = 'redeem-brand';
  brand.textContent = 'toss-it.org';
  text.append(line, brand);
  card.appendChild(text);

  row.appendChild(card);
  appendRow(row, '#8df0cc');
}

/** Y of the thread tip inside a row: the marker's center (name line's if somehow absent).
 *  offset* is used instead of rects so running FLIP transforms don't skew the numbers. */
function tipY(row: HTMLElement): number {
  const anchor =
    row.querySelector<HTMLElement>('.star, .dot, .mark') ??
    row.querySelector<HTMLElement>('.name-line');
  if (!anchor) return row.offsetTop;
  return row.offsetTop + anchor.offsetTop + anchor.offsetHeight / 2;
}

/** Viewport Y of the thread tip after the last updateRail — where the next marker splits off. */
let lastTipY: number | null = null;

/** Re-fit the single thread line: from just above the oldest message down to the newest
 *  message's marker. Its CSS transition matches smoothRise, so it glides with the column. */
function updateRail(): void {
  // Compact drops the thread with the markers it strung together: nothing to fit.
  if (compact) {
    rail.style.opacity = '0';
    lastTipY = null;
    return;
  }
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
  const marker = row.querySelector<HTMLElement>('.star, .dot, .mark');
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
  if (reduceMotion || compact) return;
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
  // Percent on the wire, 0-1 alpha in CSS; an older server sends nothing, so the stylesheet
  // default stands rather than the plate vanishing.
  if (typeof cfg.bgOpacity === 'number')
    document.documentElement.style.setProperty('--chat-bg', String(cfg.bgOpacity / 100));
  if (typeof cfg.radius === 'number')
    document.documentElement.style.setProperty('--chat-radius', `${cfg.radius}px`);
  compact = cfg.compact === true;
  chat.dataset.compact = compact ? 'on' : 'off';
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
  // ?font= / ?bg= / ?compact=1 / ?fade= / ?badges=0 / ?level=0 / ?roles=0 exercise config.
  const q = new URLSearchParams(window.location.search);
  applyConfig({
    fontSize: Number(q.get('font')) || 19,
    bgOpacity: q.has('bg') ? Number(q.get('bg')) : 58,
    compact: q.get('compact') === '1',
    radius: q.has('radius') ? Number(q.get('radius')) : 12,
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
      cosmetics: { seal: 'seal-nova-ember' },
      isFounder: false,
      level: 0,
      fragments: [{ type: 'text', text: 'печать без уровня — висит от точки' }],
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
        frame: 'frame-storm',
        seal: 'seal-nova',
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
      cosmetics: { cardEffect: 'card-sakura', seal: 'seal-keyring' },
      isFounder: false,
      level: 10,
      badges: [MODERATOR, VIP],
      role: 'moderator',
      fragments: [{ type: 'text', text: 'на этом канале с самого начала' }],
    },
    // JS-rendered card effect (a canvas web on a per-card canvas): a static contour + wind-swayed inner
    // threads. Exercises the render() hook on the smallest surface (a flat pill = fewest nodes).
    {
      id: '5b',
      userId: 'u5b',
      name: 'weaver',
      twitchColor: '#8df0cc',
      cosmetics: { cardEffect: 'card-web' },
      isFounder: false,
      level: 7,
      fragments: [{ type: 'text', text: 'соткал и жду' }],
    },
    {
      id: '5b2',
      userId: 'u5b2',
      name: 'runnerpink',
      twitchColor: '#ff6ec7',
      // The frame colour upgrade: same runner as the earned default, repainted.
      cosmetics: { frame: 'frame-runner', frameColors: { 'frame-runner': '#ff6ec7' } },
      isFounder: false,
      level: 4,
      fragments: [{ type: 'text', text: 'розовый бегунок' }],
    },
    // The two new pop scenes on the smallest surface: the rain has to keep ~6 rows of glyphs on a
    // 40px pill, and the well has to fill the whole width instead of a centred strip.
    {
      id: '5c',
      userId: 'u5c',
      name: 'nulltrace',
      twitchColor: '#7cffb0',
      cosmetics: { cardEffect: 'card-code-rain' },
      isFounder: false,
      level: 8,
      fragments: [{ type: 'text', text: 'смотри внимательнее' }],
    },
    {
      id: '5d',
      userId: 'u5d',
      name: 'violetstack',
      twitchColor: '#c9a7ff',
      cosmetics: {
        cardEffect: 'card-code-rain',
        cardEffectColors: { 'card-code-rain': '#c26bff' },
      },
      isFounder: false,
      level: 6,
      fragments: [{ type: 'text', text: 'а можно фиолетовый' }],
    },
    {
      id: '5e',
      userId: 'u5e',
      name: 'linecleaner',
      twitchColor: '#ffe14a',
      cosmetics: { cardEffect: 'card-well' },
      isFounder: false,
      level: 5,
      fragments: [{ type: 'text', text: 'ещё один ряд' }],
    },
    {
      id: '5f',
      userId: 'u5f',
      name: 'apertureboy',
      twitchColor: '#5fd8ff',
      cosmetics: {
        cardEffect: 'card-portals',
        cardEffectColors: { 'card-portals': '#5fffd0' },
        cardEffectColors2: { 'card-portals': '#ff5f8f' },
      },
      isFounder: false,
      level: 9,
      fragments: [{ type: 'text', text: 'думаю с порталами' }],
    },
    {
      id: '5g',
      userId: 'u5g',
      name: 'expelliarmus',
      twitchColor: '#ffcf94',
      cosmetics: {
        cardEffect: 'card-spellclash',
        cardEffectColors: { 'card-spellclash': '#8fb4ff' },
        cardEffectColors2: { 'card-spellclash': '#ffb03c' },
      },
      isFounder: false,
      level: 10,
      fragments: [{ type: 'text', text: 'кто кого' }],
    },
    {
      id: '6',
      userId: 'u6',
      name: 'subfan',
      twitchColor: '#7ec8ff',
      cosmetics: { cardEffect: 'card-snow', seal: 'seal-rings' },
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
    // The other CSS entrance, next to glitch on purpose: both are pure keyframes, and side by side it
    // is obvious they are different arrivals rather than two flavours of the same jitter.
    {
      id: '17',
      userId: 'u17',
      name: 'lightline',
      twitchColor: null,
      cosmetics: { nickColor: '#8df0cc', entrance: 'entrance-warp' },
      isFounder: false,
      level: 4,
      fragments: [{ type: 'text', text: 'приехал полосой света' }],
    },
    // Echo, with a wrapped multi-line message on purpose: the phantoms are drop-shadow silhouettes of
    // the REAL pill, so a tall one is where a mis-sized ghost would show.
    {
      id: '18',
      userId: 'u18',
      name: 'twice_told',
      twitchColor: null,
      cosmetics: { nickColor: '#c9b6ff', entrance: 'entrance-echo' },
      isFounder: false,
      level: 5,
      fragments: [
        { type: 'text', text: 'кажется, я это уже писал, писал, писал — и вот дописал наконец' },
      ],
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
    // Another JS entrance: the pill condenses out of a gathering constellation. A one-shot — watch it
    // assemble, not sit there. The stars land on the pill's real outline, so it scales with the text.
    {
      id: '16',
      userId: 'u16',
      name: 'stargazer_9',
      twitchColor: null,
      cosmetics: { nickColor: '#bcd9ff', entrance: 'entrance-astral' },
      isFounder: false,
      level: 8,
      fragments: [{ type: 'text', text: 'зачекинься под звёздами на секунду' }],
    },
    // The third JS entrance: a bolt lands and the pill is already there. Sat next to the other two so
    // the contrast is visible — those two carry the block for their whole run, this one is a flash and
    // an afterglow.
    {
      id: '19',
      userId: 'u19',
      name: 'stormcaller',
      twitchColor: null,
      cosmetics: { nickColor: '#ffd166', entrance: 'entrance-strike' },
      isFounder: false,
      level: 10,
      fragments: [{ type: 'text', text: 'прилетело сверху' }],
    },
    // Lotus, on a SHORT message on purpose: the flower is sized off the block's height, so a short one
    // is where the crown is largest relative to the pill — and where it would crowd the text if the
    // proportions were wrong.
    {
      id: '21',
      userId: 'u21',
      name: 'still_water',
      twitchColor: null,
      cosmetics: { nickColor: '#c9b6ff', entrance: 'entrance-lotus' },
      isFounder: false,
      level: 9,
      fragments: [{ type: 'text', text: 'раскрылось' }],
    },
    // Tide, on a two-line message on purpose: the block is held under water until it is ALL out, so a
    // tall one is where a clip that lets go early would show as the bottom half popping in.
    {
      id: '20',
      userId: 'u20',
      name: 'deep_end',
      twitchColor: null,
      cosmetics: { nickColor: '#7cc4ff', entrance: 'entrance-tide' },
      isFounder: false,
      level: 6,
      fragments: [
        {
          type: 'text',
          text: 'всплыл, отряхнулся, и вот я тут — с целым сообщением, а не половиной',
        },
      ],
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
    {
      id: '16',
      userId: 'u16',
      name: 'stargazer_9',
      twitchColor: '#a9c9ff',
      cosmetics: { cardEffect: 'card-constellation' },
      isFounder: false,
      level: 11,
      fragments: [{ type: 'text', text: 'звёзды сегодня чёткие' }],
    },
    {
      id: '17',
      userId: 'u17',
      name: 'seafoam',
      twitchColor: '#8fe3ff',
      cosmetics: { cardEffect: 'card-bubbles' },
      isFounder: false,
      level: 2,
      fragments: [{ type: 'text', text: 'дыши глубже' }],
    },
    {
      id: '18',
      userId: 'u18',
      name: 'hollow_lure',
      twitchColor: '#57e0b0',
      cosmetics: { cardEffect: 'card-wisp' },
      isFounder: false,
      level: 8,
      fragments: [{ type: 'text', text: 'иди на свет' }],
    },
    {
      id: '19',
      userId: 'u19',
      name: 'runecaller',
      twitchColor: '#c7a8ff',
      cosmetics: { cardEffect: 'card-runes' },
      isFounder: false,
      level: 9,
      fragments: [{ type: 'text', text: 'начертано на удачу' }],
    },
    {
      id: '20',
      userId: 'u20',
      name: 'mothwing',
      twitchColor: '#ff8fd6',
      cosmetics: {
        cardEffect: 'card-butterflies',
        cardEffectColors: { 'card-butterflies': '#5ad1ff' },
        // The core seal, recoloured cyan via its own colour upgrade.
        seal: 'seal-core',
        sealColors: { 'seal-core': '#5ad1ff' },
      },
      isFounder: false,
      level: 6,
      fragments: [{ type: 'text', text: 'замри — они сядут' }],
    },
    {
      id: '21',
      userId: 'u21',
      name: 'peekaboo',
      twitchColor: '#ff5a7a',
      cosmetics: { cardEffect: 'card-eyes', seal: 'seal-hourglass' },
      isFounder: false,
      level: 7,
      fragments: [{ type: 'text', text: 'не оборачивайся' }],
    },
    {
      id: '22',
      userId: 'u22',
      name: 'wickkeeper',
      twitchColor: '#ffca7a',
      cosmetics: { cardEffect: 'card-candles' },
      isFounder: false,
      level: 5,
      fragments: [{ type: 'text', text: 'пока горят — можно просить' }],
    },
    {
      id: '23',
      userId: 'u23',
      name: 'seamripper',
      twitchColor: '#b9a7ff',
      // The claw colour upgrade — crimson instead of the default violet.
      cosmetics: { cardEffect: 'card-claws', cardEffectColors: { 'card-claws': '#ff4d6a' } },
      isFounder: false,
      level: 8,
      fragments: [{ type: 'text', text: 'она рвётся, если долго смотреть' }],
    },
    {
      id: '24',
      userId: 'u24',
      name: 'piltover',
      twitchColor: '#6fd8ff',
      // The lattice colour upgrade — gold instead of the default hextech blue.
      cosmetics: {
        cardEffect: 'card-hextech',
        cardEffectColors: { 'card-hextech': '#ffb43c' },
      },
      isFounder: false,
      level: 9,
      fragments: [{ type: 'text', text: 'заряд пошёл' }],
    },
    {
      id: '25',
      userId: 'u25',
      name: 'deepcurrent',
      twitchColor: '#9db8ff',
      cosmetics: { cardEffect: 'card-jelly' },
      isFounder: false,
      level: 6,
      fragments: [{ type: 'text', text: 'тут глубоко' }],
    },
    {
      id: '27',
      userId: 'u27',
      name: 'glasstapper',
      twitchColor: '#dcf2ff',
      cosmetics: { cardEffect: 'card-hextech' },
      isFounder: false,
      level: 5,
      fragments: [{ type: 'text', text: 'оно снова подошло к стеклу' }],
    },
    {
      id: '28',
      userId: 'u28',
      name: 'holocron',
      twitchColor: '#5ac8ff',
      cosmetics: { cardEffect: 'card-blade-duel' },
      isFounder: false,
      level: 7,
      fragments: [{ type: 'text', text: 'держи блок' }],
    },
    {
      id: '26',
      userId: 'u26',
      name: 'starweaver',
      twitchColor: '#ff8fd4',
      // The web colour upgrade — pink instead of the default mint.
      cosmetics: { cardEffect: 'card-web', cardEffectColors: { 'card-web': '#ff8fd4' } },
      isFounder: false,
      level: 8,
      fragments: [{ type: 'text', text: 'сплетено заново' }],
    },
    // Notices: the three shapes the row has to survive — event + text, event alone, and an
    // anonymous actor (no cosmetics, no level, nothing to look up).
    {
      id: 'n1',
      userId: 'un1',
      name: 'streak_holder',
      twitchColor: '#ffd479',
      cosmetics: { cardEffect: 'card-stardust' },
      isFounder: false,
      level: 5,
      badges: [SUB],
      role: 'subscriber',
      notice: { type: 'watchStreak', text: 'серия просмотров · 12', count: 12 },
      fragments: [{ type: 'text', text: 'ни одного не пропустил!' }],
    },
    {
      id: 'n2',
      userId: 'un2',
      name: 'raiding_friend',
      twitchColor: '#ff7ac6',
      cosmetics: null,
      isFounder: false,
      level: 0,
      notice: { type: 'raid', text: 'рейд · 148', count: 148, otherName: 'raiding_friend' },
      fragments: [],
    },
    {
      id: 'n3',
      userId: '',
      name: 'Anonymous',
      twitchColor: null,
      cosmetics: null,
      isFounder: false,
      level: 0,
      notice: {
        type: 'subGift',
        text: 'подписка в подарок · quiet_lurker',
        otherName: 'quiet_lurker',
      },
      fragments: [],
    },
    // A decorated regular's resub: the crystal takes the thread, the level stays on the name line.
    {
      id: 'n4',
      userId: 'un4',
      name: 'oldtimer',
      twitchColor: null,
      cosmetics: { nickColor: '#a78bfa', nickEffect: 'nick-glow', cardEffect: 'card-stardust' },
      isFounder: true,
      level: 8,
      badges: [SUB],
      role: 'subscriber',
      notice: { type: 'resub', text: 'подписка · 26 мес.', count: 26 },
      fragments: [{ type: 'text', text: 'второй год с тобой' }],
    },
    // An announcement's own text IS the message; the caption is what names its mark.
    {
      id: 'n5',
      userId: 'un5',
      name: 'trusty_mod',
      twitchColor: '#00d68f',
      cosmetics: null,
      isFounder: false,
      level: 6,
      badges: [MODERATOR],
      role: 'moderator',
      notice: { type: 'announcement', text: 'объявление' },
      fragments: [{ type: 'text', text: 'через 10 минут розыгрыш — не расходимся' }],
    },
    {
      id: 'n6',
      userId: 'un6',
      name: 'bit_thrower',
      twitchColor: '#3fd35a',
      cosmetics: null,
      isFounder: false,
      level: 3,
      notice: { type: 'bitsBadgeTier', text: 'новый бейдж битов · 10 000', count: 10000 },
      fragments: [],
    },
    // Emphasis: what Twitch marks on the message itself. Art and tier color are resolved from the
    // channel's cheermote catalog server-side; here they are pinned to the real global 100-bit tier.
    {
      id: 'e1',
      userId: 'ue1',
      name: 'bit_thrower',
      twitchColor: '#7ec8ff',
      cosmetics: null,
      isFounder: false,
      level: 3,
      emphasis: { kind: 'cheer', bits: 100 },
      fragments: [
        {
          type: 'cheermote',
          text: 'Cheer100',
          bits: 100,
          prefix: 'Cheer',
          tier: 100,
          url: 'https://d3aqoihi2n8ty8.cloudfront.net/actions/cheer/dark/animated/100/2.gif',
          color: '#9c3ee8',
        },
        { type: 'text', text: ' держи на кофе' },
      ],
    },
    // The catalog can fail; then the cheer stays the plain text Twitch sent, bits still readable.
    {
      id: 'e1b',
      userId: 'ue1b',
      name: 'unresolved_cheer',
      twitchColor: '#9ab0ad',
      cosmetics: null,
      isFounder: false,
      level: 0,
      emphasis: { kind: 'cheer', bits: 50 },
      fragments: [
        { type: 'cheermote', text: 'Cheer50', bits: 50, prefix: 'Cheer', tier: 1 },
        { type: 'text', text: ' и так сойдёт' },
      ],
    },
    {
      id: 'e2',
      userId: 'ue2',
      name: 'loud_and_proud',
      twitchColor: '#c9a0ff',
      cosmetics: null,
      isFounder: false,
      level: 4,
      emphasis: { kind: 'highlighted' },
      fragments: [{ type: 'text', text: 'выделил сообщение за баллы — заметь меня' }],
    },
    {
      id: 'e3',
      userId: 'ue3',
      name: 'first_timer',
      twitchColor: '#8df0cc',
      cosmetics: null,
      isFounder: false,
      level: 0,
      emphasis: { kind: 'intro', text: 'первое сообщение' },
      fragments: [{ type: 'text', text: 'всем привет, я тут впервые' }],
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
  // Every answer shape the card has to survive, crossed with the nick looks it now carries:
  // founder + gradient, plain Twitch color, mint, an effect, and no cosmetics at all. A too-wide,
  // too-empty or clashing variant gets caught here rather than on stream.
  let sysI = 0;
  const sys = () => {
    const demoLines: ChatSystemEvent[] = [
      {
        name: 'oldtimer',
        dust: 4820,
        isFounder: true,
        twitchColor: null,
        cosmetics: {
          nickColor: '#8df0cc',
          nickColor2: '#a78bfa',
          nickFlow: true,
          nickEffect: 'nick-glow',
          cardEffect: 'card-stardust',
        },
      },
      {
        name: 'newbie_guy',
        dust: 137,
        hint: 'toss-it.org',
        isFounder: false,
        twitchColor: '#9ab0ad',
        cosmetics: null,
      },
      {
        name: 'starfall',
        text: 'перед тобой 3',
        isFounder: false,
        twitchColor: null,
        cosmetics: { nickColor: '#8df0cc' },
      },
      {
        name: 'triple',
        text: 'ты следующий · ещё 2',
        isFounder: false,
        twitchColor: null,
        cosmetics: { nickColor: '#a6e3a1', nickEffect: 'nick-pulse', cardEffect: 'card-sakura' },
      },
      {
        name: 'rainy',
        text: 'на модерации',
        isFounder: false,
        twitchColor: '#a9b8c9',
        cosmetics: null,
      },
      {
        name: 'subfan',
        text: 'сейчас в эфире · ещё 1',
        isFounder: true,
        twitchColor: null,
        cosmetics: { nickColor: '#7ec8ff', cardEffect: 'card-snow' },
      },
      {
        name: 'ghost_in_the_wire',
        text: 'ничего не вижу — если отправлял с сайта, привяжи Twitch',
        hint: 'toss-it.org',
        isFounder: false,
        twitchColor: null,
        cosmetics: { nickColor: '#00f0ff', nickEffect: 'nick-glow' },
      },
      {
        name: 'grinder',
        text: 'ур. 6 · 8000/12800 XP',
        isFounder: false,
        twitchColor: null,
        cosmetics: { nickColor: '#b45cff', nickEffect: 'nick-glow', cardEffect: 'card-embers' },
      },
    ];
    renderSystem(demoLines[sysI++ % demoLines.length]!);
  };
  // Every mark at once, one screen: a shape that fails to read, or drifts off the thread, is only
  // obvious next to the others. They also ride the ordinary loop above, mixed into real chat.
  const noticeSamples = demo.filter((m) => m.notice);
  let noticeRun = 0;
  const notices = () => {
    noticeRun += 1;
    for (const sample of noticeSamples)
      renderMessage({ ...sample, id: `${sample.id}-${noticeRun}` });
  };
  (window as unknown as Record<string, unknown>).__push = push;
  (window as unknown as Record<string, unknown>).__redeem = redeem;
  (window as unknown as Record<string, unknown>).__sys = sys;
  (window as unknown as Record<string, unknown>).__notices = notices;
  push();
  notices();
  if (!q.has('manual')) {
    window.setInterval(push, 1900);
    window.setInterval(redeem, 6100); // periodic stardust line among the chatter
    window.setInterval(sys, 8300); // periodic !balance answer
    window.setInterval(notices, 11700); // the notice trio, one event at a time
  }
} else {
  const socket = connectOverlay(SERVER_URL, token ?? '', 'chat');
  socket.on('chat:config', applyConfig);
  socket.on('chat:message', renderMessage);
  socket.on('chat:redemption', renderRedemption);
  socket.on('chat:system', renderSystem);
  socket.on('chat:delete', removeMessage);
  socket.on('chat:clearUser', removeUser);
  socket.on('chat:clear', clearAll);
}
