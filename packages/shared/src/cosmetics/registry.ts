import type {
  CardEffectModule,
  CosmeticItem,
  CosmeticModule,
  CosmeticType,
  Rnd,
  Surface,
} from './types';
import type { TtsVoiceModule } from './types';
import { nickColor } from './effects/nick-color';
import { nickGlow } from './effects/nick-glow';
import { nickPulse } from './effects/nick-pulse';
import { cardLevitation } from './effects/card-levitation';
import { cardEmbers } from './effects/card-embers';
import { cardStardust } from './effects/card-stardust';
import { cardRain } from './effects/card-rain';
import { cardSnow } from './effects/card-snow';
import { ttsVoices } from './voices';

/**
 * Structural CSS shared by every card effect: the clipped particle layer and the particle reset.
 * Effect-specific looks live in each module's `css`. Particles fade in/out, so reduced-motion
 * (animation off) simply leaves them invisible.
 */
const BASE_CSS = `
.card-fx {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: inherit;
}
.card-fx .p {
  position: absolute;
  opacity: 0;
}
/* Ground glow: a fixed element pinned to the bottom at a particle's origin/impact column (see
   groundGlow). Each effect sets its size/look/keyframe; left is inline. */
.card-fx .g {
  position: absolute;
  bottom: 0;
  opacity: 0;
  pointer-events: none;
  transform-origin: center bottom;
}
`;

/**
 * Single source of truth for buyable cosmetics. Registration order is the shop display order
 * within each category. To add an effect: drop a module in ./effects and add it here — nothing
 * else branches on effect id.
 */
export const COSMETIC_MODULES: CosmeticModule[] = [
  nickColor,
  nickGlow,
  nickPulse,
  cardLevitation,
  cardEmbers,
  cardStardust,
  cardRain,
  cardSnow,
  ...ttsVoices,
];

const BY_ID = new Map<string, CosmeticModule>(COSMETIC_MODULES.map((m) => [m.id, m]));

/** Look up a module by catalog id. */
export function cosmeticModule(id: string): CosmeticModule | undefined {
  return BY_ID.get(id);
}

/** Catalog metadata — the back-compat `COSMETICS` array many callers still consume. */
export const COSMETICS: CosmeticItem[] = COSMETIC_MODULES.map(({ id, type, costDust }) => ({
  id,
  type,
  costDust,
}));

/** Whether an id is a buyable cosmetic of the given type. */
export function isCosmeticOfType(id: string, type: CosmeticType): boolean {
  return BY_ID.get(id)?.type === type;
}

function asCardEffect(id: string): CardEffectModule | undefined {
  const m = BY_ID.get(id);
  return m?.type === 'card_effect' ? m : undefined;
}

/** Particle count for a card effect on a given surface (0 for unknown / non-card ids). */
export function particleCount(id: string, surface: Surface): number {
  return asCardEffect(id)?.counts[surface] ?? 0;
}

/** Layer class for a card effect (e.g. 'card-fx-levitation'), or '' if not a card effect. */
export function cardEffectClass(id: string): string {
  return asCardEffect(id)?.className ?? '';
}

/** Name-element class for a nick effect (e.g. 'nick-glow'), or '' if not a nick effect. */
export function nickEffectClass(id: string): string {
  const m = BY_ID.get(id);
  return m?.type === 'nick_effect' ? m.className : '';
}

/** TTS voice module by catalog id, or undefined for unknown / non-voice ids. */
export function ttsVoiceModule(id: string): TtsVoiceModule | undefined {
  const m = BY_ID.get(id);
  return m?.type === 'tts_voice' ? m : undefined;
}

const rnd: Rnd = (a, b) => a + Math.random() * (b - a);

/**
 * Inline styles for `count` randomized particles of a card effect — an organic swarm rather than a
 * looped GIF. Returns [] for unknown / non-card effects. Generate once per mount (values are random
 * each call).
 */
export function makeParticles(id: string, count: number): Record<string, string>[] {
  const m = asCardEffect(id);
  if (!m) return [];
  return Array.from({ length: count }, () => m.particle(rnd));
}

/**
 * Ground-glow styles paired 1:1 with the given particles — a fixed bloom at each particle's
 * origin/impact column (see CardEffectModule.groundGlow). Returns [] if the effect has none.
 * Render only on non-compact surfaces (a glow strip would clutter a leaderboard row / chat pill).
 */
export function makeGroundGlows(
  id: string,
  particles: Record<string, string>[],
): Record<string, string>[] {
  const glow = asCardEffect(id)?.groundGlow;
  return glow ? particles.map((p) => glow(p)) : [];
}

/** Concatenated CSS for the whole catalog (base layer + every module's css). */
export function cosmeticsCss(): string {
  return [BASE_CSS, ...COSMETIC_MODULES.map((m) => m.css ?? '')].filter(Boolean).join('\n');
}

/**
 * Inject the cosmetics stylesheet once (idempotent). Call at app boot on each surface (web, media
 * overlay, chat overlay) so cards/names have their effect styles before first render. No-ops off
 * the browser, so it's safe to reach from shared code the server also imports.
 */
export function injectCosmeticsStyles(): void {
  if (typeof document === 'undefined') return;
  const ID = 'cosmetics-styles';
  if (document.getElementById(ID)) return;
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = cosmeticsCss();
  document.head.appendChild(style);
}
