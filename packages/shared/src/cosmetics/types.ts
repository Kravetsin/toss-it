/**
 * Cosmetics module system. One effect = one self-contained module (metadata + particles + CSS +
 * label keys); every consumer (web cards, shop drawer, both overlays, server catalog) reads from
 * the registry instead of hard-coding per-effect branches. See ./effects/* for the modules.
 *
 * Cosmetics are bought with stardust, never money (see CLAUDE.md / product notes). The DB stores
 * only ownership + equip state; the catalog lives here in code.
 */

/** Cosmetic categories: nick color, nick effects (on the name), card effects (particle swarm). */
export type CosmeticType = 'nick_color' | 'nick_effect' | 'card_effect';

/** Render surfaces a card effect is drawn on; particle counts are tuned per surface. */
export type Surface = 'web' | 'overlayCard' | 'overlayChat';

/** Randomness helper handed to a particle factory: uniform float in [min, max). */
export type Rnd = (min: number, max: number) => number;

/** Catalog metadata — the shape the DB + shop care about (public name kept as `CosmeticItem`). */
export interface CosmeticItem {
  /** Stable catalog id; stored in user_cosmetics. */
  id: string;
  type: CosmeticType;
  /** Price in stardust. */
  costDust: number;
}

/** i18n keys for the shop; the actual strings live in apps/web i18n dictionaries (per convention). */
export interface CosmeticLabelKeys {
  /** i18n key for the display name. */
  name: string;
  /** i18n key for the one-line description. */
  desc: string;
}

interface BaseModule extends CosmeticItem {
  labels: CosmeticLabelKeys;
  /**
   * CSS injected once at boot on each surface (see injectCosmeticsStyles). Use
   * `var(--color-accent, #8df0cc)` for the accent so it also works off-token on the overlay,
   * where the web design tokens are not defined.
   */
  css?: string;
}

/** Free-form nickname color — no CSS/particles of its own; the UI renders the picked color. */
export interface ColorModule extends BaseModule {
  type: 'nick_color';
}

/** An effect applied as a class on the name element (e.g. glow). */
export interface NickEffectModule extends BaseModule {
  type: 'nick_effect';
  /** Class added to the name element; the module's CSS targets it. */
  className: string;
}

/** A particle swarm drawn over the whole card / row / alert. */
export interface CardEffectModule extends BaseModule {
  type: 'card_effect';
  /** Class added alongside `card-fx` on the particle layer (e.g. 'card-fx-levitation'). */
  className: string;
  /** Particle count per surface (small pills need fewer than a full-screen alert). */
  counts: Record<Surface, number>;
  /**
   * Inline style for ONE randomized particle. Randomize spawn/size/speed and set the animation
   * timing through the `--dur`/`--delay` custom properties (NEGATIVE delay so particles start
   * mid-flight, desynced) — the css should read `animation: <name> var(--dur) linear var(--delay)`
   * so a paired ground glow can inherit the same timing and bloom in sync. Keys are camelCase CSS
   * props or `--custom` properties, usable as a React style object or via element.style.
   */
  particle: (rnd: Rnd) => Record<string, string>;
  /**
   * Optional: given a particle's generated style, return the style for a fixed "ground glow"
   * element (class `g`) pinned to the bottom of the card at that particle's origin (rising effects)
   * or impact column (falling effects). Copy `--dur`/`--delay` from the particle so the glow blooms
   * in sync; the module's css styles `.card-fx-<x> .g` + a keyframe. Consumers render one `g` per
   * particle (non-compact surfaces only). Omit for effects with no ground glow.
   */
  groundGlow?: (particle: Record<string, string>) => Record<string, string>;
}

export type CosmeticModule = ColorModule | NickEffectModule | CardEffectModule;

/** What a user currently has equipped (one slot per category). */
export interface EquippedCosmetics {
  /** Free-form #rrggbb nickname color; requires owning the 'nick-color' item. */
  nickColor?: string | null;
  /** Equipped nick effect item id (e.g. 'nick-glow'); requires owning it. */
  nickEffect?: string | null;
  /** Equipped card effect item id (e.g. 'card-levitation'); requires owning it. */
  cardEffect?: string | null;
}

/** Returned by /api/cosmetics/buy and /equip — the user's post-mutation cosmetic state. */
export interface CosmeticStateResponse {
  stardust: number;
  ownedCosmetics: string[];
  equipped: EquippedCosmetics;
}
