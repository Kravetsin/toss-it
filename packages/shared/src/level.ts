/**
 * Per-channel viewer level (0–10) and its rarity badge. XP is all-time, per channel:
 * chat messages + watch-minutes (1 pt each) + aired submissions (10 pts each). Thresholds double
 * from 200 and cap at 10 — level 10 ≈ channel old-timer. The level is computed server-side (see the
 * twitch-chat module) and rides on ChatOverlayMessage; this module is the single source of the
 * curve, the rarity palette, and the badge SVG (consumed by the overlay now, web later).
 */

export const LEVEL_POINTS = { message: 1, watchMinute: 1, airedSend: 10 } as const;
export const MAX_LEVEL = 10;

/** All-time XP needed to reach level n: 200·2^(n-1) (L1=200 … L10=102 400). */
export function levelThreshold(level: number): number {
  return 200 * 2 ** (level - 1);
}

/** Level 0–10 for the given all-time XP; 0 = below the first threshold (no badge yet). */
export function xpToLevel(xp: number): number {
  let level = 0;
  for (let l = 1; l <= MAX_LEVEL; l++) {
    if (xp >= levelThreshold(l)) level = l;
    else break;
  }
  return level;
}

export interface LevelTier {
  name: string;
  /** Rarity color; also duplicated on the card's left border for legibility at small badge sizes. */
  color: string;
  /** Eternal (10) is iridescent: the badge renders a gradient; `color` is the border/glow fallback. */
  iris?: boolean;
}

/** Index 0 = level 1. Tiers 1–6 are the RPG canon (WoW-anchored); 7–10 are ours. */
export const LEVEL_TIERS: LevelTier[] = [
  { name: 'Common', color: '#b8c0c0' },
  { name: 'Uncommon', color: '#3ddc5a' },
  { name: 'Rare', color: '#3b9dff' },
  { name: 'Epic', color: '#b45cff' },
  { name: 'Legendary', color: '#ff9f2e' },
  { name: 'Mythic', color: '#ff4d4d' },
  { name: 'Ancient', color: '#2dd4d4' },
  { name: 'Divine', color: '#dbe4ff' },
  { name: 'Celestial', color: '#ff6fd8' },
  { name: 'Eternal', color: '#c9a0ff', iris: true },
];

export function levelTier(level: number): LevelTier | null {
  return level >= 1 && level <= MAX_LEVEL ? LEVEL_TIERS[level - 1]! : null;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** Level 1–10 as a Roman numeral ('' for 0) — reads as a rank and stays legible at chat font size. */
export function toRoman(level: number): string {
  return ROMAN[level] ?? '';
}

/** Border/numeral glow kicks in from this level (a quiet cue that a rank is "high"). */
export const LEVEL_GLOW_FROM = 6;

/**
 * Injected once at boot (like injectCosmeticsStyles). The only level chrome that needs a stylesheet:
 * the Eternal (tier 10) iridescent shimmer — a slow hue-rotate on the rank rail + numeral, which a
 * flat color can't do. React elements opt in with the `lvl-iris` class; the overlay rails are
 * ::before pseudo-elements, so their row/banner opts in with a `data-iris` attribute.
 */
const LEVEL_CSS = `
@keyframes lvl-iris-hue { to { filter: hue-rotate(360deg); } }
.lvl-iris,
[data-iris]::before,
[data-iris] .lvl-num {
  animation: lvl-iris-hue 4s linear infinite;
}
`;
export function injectLevelStyles(): void {
  if (typeof document === 'undefined') return;
  const ID = 'level-styles';
  if (document.getElementById(ID)) return;
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = LEVEL_CSS;
  document.head.appendChild(style);
}

function lighten(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round((n >> 16) + (255 - (n >> 16)) * amt);
  const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amt);
  const b = Math.round((n & 255) + (255 - (n & 255)) * amt);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

/** Light badges need a dark number; dark badges a light one. */
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.65;
}

let irisSeq = 0;

/**
 * Rarity badge as an SVG string: one hexagon shape, colored by tier, level number inside, glow
 * growing with the level. Constant/derived markup (no user input) — safe to inject via innerHTML.
 * Returns '' for level 0.
 */
export function levelBadgeSvg(level: number, size = 18): string {
  const tier = levelTier(level);
  if (!tier) return '';
  const glow = (2.5 + (level - 1) * 0.9).toFixed(1);
  const light = tier.iris ? false : isLight(tier.color);
  const numFill = light ? '#2a2f3a' : '#ffffff';
  const numStroke = light ? '#ffffff' : '#0b0f0f';
  const num = `<text x="14" y="14" text-anchor="middle" dominant-baseline="central" font-size="${
    level >= 10 ? 8.5 : 11
  }" font-weight="800" font-family="ui-monospace,monospace" fill="${numFill}" stroke="${numStroke}" stroke-width="0.7" paint-order="stroke">${level}</text>`;

  let defs = '';
  let fill = tier.color;
  let stroke = lighten(tier.color, 0.42);
  if (tier.iris) {
    const id = `irisg${irisSeq++}`;
    defs = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset=".5" stop-color="#a855f7"/><stop offset="1" stop-color="#f5c542"/></linearGradient></defs>`;
    fill = `url(#${id})`;
    stroke = '#ffffff';
  }
  const glowColor = tier.iris ? '#a855f7' : tier.color;
  return `<svg width="${size}" height="${size}" viewBox="0 0 28 28" aria-hidden="true" style="filter:drop-shadow(0 0 ${glow}px ${glowColor})">${defs}<polygon points="9,3 19,3 25,14 19,25 9,25 3,14" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>${num}</svg>`;
}
