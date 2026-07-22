import type {
  CardEffectModule,
  CosmeticItem,
  CosmeticModule,
  CosmeticType,
  EntranceModule,
  FrameModule,
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
import { cardConstellation } from './effects/card-constellation';
import { cardBubbles } from './effects/card-bubbles';
import { cardWisp } from './effects/card-wisp';
import { cardRunes } from './effects/card-runes';
import { cardWeb } from './effects/card-web';
import { frameRunner } from './effects/frame-runner';
import { frameRunnerDouble } from './effects/frame-runner-double';
import { frameDragonBreath } from './effects/frame-dragon-breath';
import { frameVine } from './effects/frame-vine';
import { entranceGlitch } from './effects/entrance-glitch';
import { entranceAstral } from './effects/entrance-astral';
import { entrancePortal } from './effects/entrance-portal';
import { entrancePortalColor } from './effects/entrance-portal-color';
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
/* Frame effects (a runner of light on the card border). The class goes on the card HOST; the module
   paints the ::after's conic background. Shared geometry here: a thin masked ring on the ::after, INSET
   (inset:0) so overflow:hidden cards (chat bubble, web card) never clip it, radius inherited from the
   card. The card host must be position:relative — the card surfaces already are. */
@property --frame-ang {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
[class*='frame-fx-']::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 2px;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}
/* The angle sweeps a full turn but NOT at a constant rate: θ = 360t + 30·sin(2πt), sampled below.
   That glides — it speeds up and eases off once per lap — and is seamless: the rate over the last
   segment (294→360) equals the rate over the first (0→66), so there's no lurch at the loop point.
   Keep the animation timing-function linear; the uneven angle steps ARE the speed variation. */
@keyframes frame-run {
  0% {
    --frame-ang: 0deg;
  }
  12.5% {
    --frame-ang: 66deg;
  }
  25% {
    --frame-ang: 120deg;
  }
  37.5% {
    --frame-ang: 156deg;
  }
  50% {
    --frame-ang: 180deg;
  }
  62.5% {
    --frame-ang: 204deg;
  }
  75% {
    --frame-ang: 240deg;
  }
  87.5% {
    --frame-ang: 294deg;
  }
  100% {
    --frame-ang: 360deg;
  }
}
@media (prefers-reduced-motion: reduce) {
  [class*='frame-fx-']::after {
    animation: none;
  }
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
  cardConstellation,
  cardBubbles,
  cardWisp,
  cardRunes,
  cardWeb,
  // Frames group by the metric that earns them: chat-message ladder first, then watch-time.
  frameRunner,
  frameRunnerDouble,
  frameDragonBreath,
  frameVine,
  entranceGlitch,
  entranceAstral,
  entrancePortal,
  entrancePortalColor,
  ...ttsVoices,
];

const BY_ID = new Map<string, CosmeticModule>(COSMETIC_MODULES.map((m) => [m.id, m]));

/** Look up a module by catalog id. */
export function cosmeticModule(id: string): CosmeticModule | undefined {
  return BY_ID.get(id);
}

/** Catalog metadata — the back-compat `COSMETICS` array many callers still consume. */
export const COSMETICS: CosmeticItem[] = COSMETIC_MODULES.map(
  ({ id, type, costDust, requires, upgrade, earn }) => ({
    id,
    type,
    costDust,
    requires,
    upgrade,
    earn,
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

/** Frame module by catalog id, or undefined for unknown / non-frame ids. */
export function frameModule(id: string | null | undefined): FrameModule | undefined {
  if (!id) return undefined;
  const m = BY_ID.get(id);
  return m?.type === 'frame' ? m : undefined;
}

/** Class a surface puts on the card host for an equipped frame (e.g. 'frame-fx-runner'), or '' for
 *  none/unknown. The class alone drives the effect — the injected stylesheet does the rest. */
export function frameEffectClass(id: string | null | undefined): string {
  return frameModule(id)?.className ?? '';
}

/** Entrance module by catalog id, or undefined for unknown / non-entrance ids. */
export function entranceModule(id: string): EntranceModule | undefined {
  const m = BY_ID.get(id);
  return m?.type === 'entrance' ? m : undefined;
}

/**
 * Mark `el` as the thing that is ARRIVING, wearing the viewer's entrance if they have one equipped.
 * Call it on the element the surface animates in (the chat bubble, the stage alert). No-ops for an
 * unequipped/unknown id, which is what leaves the surface's own `:not([data-fx])` default running.
 *
 * `reduceMotion`: pass the surface's own media-query result. Handled HERE rather than in each
 * module's css because a module cannot be trusted to remember, and the cost of forgetting is a
 * viewer's cosmetic overriding someone's accessibility setting — the entrance simply isn't applied,
 * and the surface's default (already killed by its own reduced-motion rule) leaves a plain appear.
 */
export function applyEntrance(
  el: HTMLElement,
  id: string | null | undefined,
  reduceMotion: boolean,
  color?: string | null,
): void {
  if (!id || reduceMotion) return;
  const m = BY_ID.get(id);
  if (m?.type !== 'entrance') return;
  // Set data-fx in every case: it's what makes the surface's `:not([data-fx])` default stand down.
  // For a CSS entrance that attribute IS the effect; a JS entrance additionally runs `play`, which
  // owns the animation itself (the fire-and-forget teardown is fine — the effect self-cleans). The
  // optional `color` (an equipped upgrade) is forwarded; mount stays the default body layer here.
  el.dataset.fx = m.fx;
  m.play?.(el, undefined, color ?? undefined);
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
  if (!m || !m.particle) return [];
  return Array.from({ length: count }, (_, i) => m.particle!(rnd, compact, i));
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
 * Class for a card effect's particle layer on a given surface, or '' when there is nothing to draw
 * (unknown id, or a surface this effect has no count for).
 *
 * This and fillCardEffect split the job along the only line that actually differs between consumers:
 * the ELEMENT belongs to whoever renders (React must own its own node), everything about what goes
 * inside it belongs here. Before the split, "mount a card effect" existed three times — twice in the
 * overlays byte-for-byte identical but for the surface and `compact` literals, and once more in
 * React — so every new axis of cosmetics was a copy-paste tax paid three ways.
 */
export function cardEffectLayerClass(id: string, surface: Surface, compact: boolean): string {
  const cls = cardEffectClass(id);
  if (!cls || !particleCount(id, surface)) return '';
  return `card-fx ${cls}${compact ? ' compact' : ''}`;
}

/**
 * Fill a layer element with its particles and their ground glows, and keep the spawn columns fresh
 * (see bindRespawn). Returns a teardown. The layer need not be in the document yet.
 *
 * The teardown REMOVES what it added, and that is not a nicety: a caller that re-runs this on the
 * same layer (a React effect re-firing on a prop change — or twice on mount, as StrictMode does in
 * dev) would otherwise stack a second swarm on top of the first, and the effect would quietly render
 * at double density.
 */
export function fillCardEffect(
  layer: HTMLElement,
  id: string,
  surface: Surface,
  compact: boolean,
): () => void {
  // A JS-rendered effect (a canvas web, not a particle swarm) owns the whole layer itself.
  const m = asCardEffect(id);
  if (m?.render && typeof window !== 'undefined') {
    return m.render(layer, surface, compact) ?? (() => {});
  }
  const count = particleCount(id, surface);
  if (!count) return () => {};
  const particles = makeParticles(id, count, compact);
  const added: HTMLElement[] = [];
  for (const ps of particles) {
    const p = document.createElement('span');
    p.className = 'p';
    applyStyleMap(p, ps);
    layer.appendChild(p);
    added.push(p);
  }
  // Ground glows: a bloom at each particle's origin/impact column, pinned to the bottom. The module
  // decides which particles get one (an off-focus plane never lands on this card).
  for (const gs of makeGroundGlows(id, particles)) {
    const g = document.createElement('span');
    g.className = 'g';
    applyStyleMap(g, gs);
    layer.appendChild(g);
    added.push(g);
  }
  const off = bindRespawn(layer, id, particles, compact);
  return () => {
    off();
    for (const el of added) el.remove();
  };
}

/**
 * Create the layer, fill it and hang it on `host` — the whole job, for consumers that build DOM by
 * hand (both overlays). Returns a teardown; no-ops when the effect draws nothing on this surface.
 * React renders its own layer instead and calls fillCardEffect: handing its node to this would mean
 * an extra wrapper, and the layer's `border-radius: inherit` reads its PARENT — one element in
 * between and every rounded card gets square corners under its particles.
 */
export function mountCardEffect(
  host: HTMLElement,
  id: string,
  surface: Surface,
  compact: boolean,
): () => void {
  const cls = cardEffectLayerClass(id, surface, compact);
  if (!cls) return () => {};
  const layer = document.createElement('span');
  layer.className = cls;
  layer.setAttribute('aria-hidden', 'true');
  const off = fillCardEffect(layer, id, surface, compact);
  host.appendChild(layer);
  return () => {
    off();
    layer.remove();
  };
}

/**
 * Give each particle a NEW spawn column at the end of every cycle, and move its ground glow with it.
 * Returns a teardown. Call once per mounted layer, passing the same particle maps the elements were
 * built from; `.p` and `.g` children are paired by index, exactly as the consumers render them.
 *
 * Why this exists: makeParticles runs once per mount, so `left` was chosen once and the particle
 * then looped in that one column FOREVER — the swarm was N stationary taps, which is precisely the
 * "looped GIF" makeParticles claims not to be. Invisible while every particle is a faint speck; the
 * moment depth made a few of them big and loud it read as a waterfall, worst in card-rain, whose
 * near drops re-fire from the same column ~2.5 times a second.
 *
 * Only the COLUMN is re-rolled. Size and speed must not be, tempting as it looks: `--dur` feeds a
 * running animation whose progress is derived from elapsed time, so changing it re-maps the phase
 * and teleports the particle mid-flight — and re-rolling size while keeping duration would break the
 * one rule depth rests on, that speed follows size (see ../depth).
 *
 * The module is asked for the new column rather than us picking one: spawn ranges are the effect's
 * own business (stardust spawns from -8%, lightning from 12%, embers from 4%), and the glow's offset
 * from it even more so — stardust re-derives its drift, lightning pins to the strike. Hence
 * `groundGlow()` rather than copying `left` across.
 *
 * Safe on the boundary: every effect's cycle opens at opacity 0, so the jump is never seen. Pseudo-
 * element animations (sakura's tumble and sway, the shrink/burnout) also fire this event on `.p` and
 * are filtered out — otherwise one cycle would respawn two or three times.
 */
export function bindRespawn(
  layer: HTMLElement,
  id: string,
  particles: Record<string, string>[],
  compact: boolean,
): () => void {
  const m = asCardEffect(id);
  if (!m || !m.particle || typeof window === 'undefined') return () => {};
  const ps = layer.querySelectorAll<HTMLElement>('.p');
  const gs = layer.querySelectorAll<HTMLElement>('.g');
  // Our own copies: the maps belong to the caller (React memoises them) and must not be mutated.
  const maps = particles.map((p) => ({ ...p }));
  const offs: (() => void)[] = [];
  ps.forEach((p, i) => {
    const map = maps[i];
    if (!map) return;
    const onIteration = (e: AnimationEvent) => {
      if (e.pseudoElement) return;
      const fresh = m.particle!(rnd, compact, i);
      if (!fresh.left) return;
      // The column, plus whatever else the module says is safe to be reborn with.
      for (const k of ['left', ...(m.respawnKeys ?? [])]) {
        const v = fresh[k];
        if (v === undefined) continue;
        map[k] = v;
        if (k.startsWith('--')) p.style.setProperty(k, v);
        else (p.style as unknown as Record<string, string>)[k] = v;
      }
      const g = gs[i];
      if (g && m.groundGlow) applyStyleMap(g, m.groundGlow(map));
    };
    p.addEventListener('animationiteration', onIteration);
    offs.push(() => p.removeEventListener('animationiteration', onIteration));
  });
  return () => offs.forEach((off) => off());
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
