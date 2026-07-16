import type {
  CardEffectModule,
  CosmeticItem,
  CosmeticModule,
  CosmeticType,
  NickEffectModule,
  Rnd,
  Surface,
} from './types';
import type { TtsVoiceModule } from './types';
import { nickColor } from './effects/nick-color';
import { nickGradient } from './effects/nick-gradient';
import { nickFlow } from './effects/nick-flow';
import { nickGlow } from './effects/nick-glow';
import { nickPulse } from './effects/nick-pulse';
import { cardLevitation } from './effects/card-levitation';
import { cardEmbers } from './effects/card-embers';
import { cardLightning } from './effects/card-lightning';
import { cardSakura } from './effects/card-sakura';
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
/* Cosmetics' own brand mint. Deliberately NOT --color-accent: a cosmetic belongs to the VIEWER who
   bought it and must look identical everywhere (channel page, both overlays, later the Twitch chat
   extension) — reading the accent would repaint it per channel theme and per surface. */
:root {
  --cos-mint: #8df0cc;
  /* Ink a painted name ramps between when the viewer owns no nick colour — surfaces may override
     it to their own text colour. Matches the overlays' #ededec. */
  --nick-ink: #ededec;
}
/* A name drawn THROUGH its background (gradient, or any effect declaring paintsName): the colour
   lives in --nick-base (set by nickRender) and effects stack extra layers over it from their own
   module CSS. See ./nick.ts for the model; the gotchas below are load-bearing, don't inline them
   back into nickRender. */
.nick-paint {
  background-image: var(--nick-base);
  background-clip: text;
  -webkit-background-clip: text;
  /* Both: plain color covers engines without -webkit-text-fill-color. */
  color: transparent;
  -webkit-text-fill-color: transparent;
  /* The ramp spans the element BOX, not the glyphs — in a full-width box the name gets only the
     ramp's first slice and stop 2 never shows. Shrink to the text (max-width keeps truncate
     working). Flex/grid children blockify this away and must shrink themselves (self-start). */
  display: inline-block;
  max-width: 100%;
  /* Surfaces put a legibility text-shadow on the CONTAINER and the name inherits it; transparent
     glyphs don't hide it — it paints as a black ghost of the letters. Those containers carry their
     own dark plate, so dropping it is safe. */
  text-shadow: none;
}
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
  nickGradient,
  nickFlow,
  nickGlow,
  nickPulse,
  cardLevitation,
  cardEmbers,
  cardStardust,
  cardRain,
  cardSnow,
  cardSakura,
  cardLightning,
  ...ttsVoices,
];

const BY_ID = new Map<string, CosmeticModule>(COSMETIC_MODULES.map((m) => [m.id, m]));

/** Look up a module by catalog id. */
export function cosmeticModule(id: string): CosmeticModule | undefined {
  return BY_ID.get(id);
}

/** Catalog metadata — the back-compat `COSMETICS` array many callers still consume. */
export const COSMETICS: CosmeticItem[] = COSMETIC_MODULES.map(
  ({ id, type, costDust, requires }) => ({
    id,
    type,
    costDust,
    requires,
  }),
);

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
  return nickEffectModule(id)?.className ?? '';
}

/** Nick-effect module by catalog id, or undefined for unknown / non-nick-effect ids. */
export function nickEffectModule(id: string): NickEffectModule | undefined {
  const m = BY_ID.get(id);
  return m?.type === 'nick_effect' ? m : undefined;
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
 * each call). `compact` (short container: leaderboard row, chat pill) is required rather than
 * defaulted so a new consumer has to answer the question instead of silently getting a card's
 * geometry in a 40px row — see CardEffectModule.particle.
 */
export function makeParticles(
  id: string,
  count: number,
  compact: boolean,
): Record<string, string>[] {
  const m = asCardEffect(id);
  if (!m) return [];
  return Array.from({ length: count }, () => m.particle(rnd, compact));
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

/**
 * Apply a style map (from makeParticles / makeGroundGlows / nickRender) to an element: `--custom`
 * properties go through setProperty, the rest are camelCase CSSStyleDeclaration keys. For the
 * overlays' hand-built DOM — React consumers spread the same map as a style object instead.
 */
export function applyStyleMap(el: HTMLElement, styles: Record<string, string>): void {
  for (const [k, v] of Object.entries(styles)) {
    if (k.startsWith('--')) el.style.setProperty(k, v);
    else (el.style as unknown as Record<string, string>)[k] = v;
  }
}

/** Concatenated CSS for the whole catalog (base layer + every module's css). */
export function cosmeticsCss(): string {
  return [BASE_CSS, ...COSMETIC_MODULES.map((m) => m.css ?? '')].filter(Boolean).join('\n');
}

/**
 * Inject the cosmetics stylesheet. Call at app boot on each surface (web, media overlay, chat
 * overlay) so cards/names have their effect styles before first render. No-ops off the browser, so
 * it's safe to reach from shared code the server also imports.
 *
 * Re-running REFRESHES the tag instead of bailing out. It used to return early whenever the tag
 * existed, which made every hot reload a lie: an effect's `css` would change, the module would
 * re-run, and the page kept serving the previous stylesheet — you'd be reading new code while
 * watching the old effect, and only a hard reload told the truth.
 */
export function injectCosmeticsStyles(): void {
  if (typeof document === 'undefined') return;
  const ID = 'cosmetics-styles';
  const css = cosmeticsCss();
  const existing = document.getElementById(ID);
  if (existing) {
    // Guard the write: re-assigning identical text would still re-parse the sheet on every call.
    if (existing.textContent !== css) existing.textContent = css;
    return;
  }
  const style = document.createElement('style');
  style.id = ID;
  style.textContent = css;
  document.head.appendChild(style);
}
