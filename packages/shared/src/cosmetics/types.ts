/**
 * Cosmetics module system. One effect = one self-contained module (metadata + particles + CSS +
 * label keys); every consumer (web cards, shop drawer, both overlays, server catalog) reads from
 * the registry instead of hard-coding per-effect branches. See ./effects/* for the modules.
 *
 * Cosmetics are bought with stardust, never money (see CLAUDE.md / product notes). The DB stores
 * only ownership + equip state; the catalog lives here in code.
 */

/** Cosmetic categories: nick color, nick effects (on the name), card effects (particle swarm),
 *  TTS voices (picked per submission, not equipped). */
export type CosmeticType = 'nick_color' | 'nick_effect' | 'card_effect' | 'tts_voice';

/** Languages the TTS voices cover (matches piper voice models on the server). */
export type TtsLang = 'ru' | 'uk' | 'en';

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
  /**
   * Catalog id that must be owned before this one can be bought (the nick-colour ladder:
   * colour → gradient → flow). Enforced server-side on /buy, not just hidden in the shop —
   * an upgrade with no foundation is a dead purchase. Undefined = buyable on its own.
   */
  requires?: string;
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
   * CSS injected once at boot on each surface (see injectCosmeticsStyles). For the brand mint use
   * `var(--cos-mint, #8df0cc)` — never `--color-accent`, which a channel theme repaints, so the
   * same cosmetic would differ between the channel page and the overlays.
   */
  css?: string;
}

/**
 * The nickname-colour family: the base colour and its upgrades (gradient, flow). The plain colour
 * items carry no CSS — the UI renders the picked colour. An upgrade that animates the name (flow)
 * ships `className` + `css` and paints over `var(--nick-base)`; see ./nick.ts for the model.
 */
export interface ColorModule extends BaseModule {
  type: 'nick_color';
  /** Class nickRender puts on the name when this upgrade is equipped; the module's CSS targets it. */
  className?: string;
  /** See NickEffectModule.animation — nick cosmetics share one element and one `animation` slot. */
  animation?: string;
}

/** An effect applied as a class on the name element (e.g. glow). */
export interface NickEffectModule extends BaseModule {
  type: 'nick_effect';
  /** Class added to the name element; the module's CSS targets it. */
  className: string;
  /**
   * The `animation` shorthand this effect runs (e.g. 'nick-glow 2s linear infinite'), declared here
   * instead of in `css`. Several nick cosmetics land on the SAME element (a flowing gradient with a
   * pulse), and `animation` is one property — whichever module's rule came last would silently kill
   * the others. nickRender collects these and sets the composed list inline. Keep the @keyframes in
   * `css`; put only the shorthand here.
   */
  animation?: string;
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
   *
   * `compact` = the container is a short one (leaderboard row, chat pill) rather than a card or an
   * alert. It is the only honest signal of how much VERTICAL room the particle gets: `Surface`
   * can't answer that, since 'web' covers both a 40px row and a 192px card. Most effects ignore it
   * and vary only through `.compact` CSS; geometry that has to thin out in a short box (lightning's
   * bend count) needs it here, because the shape is generated, not styled.
   */
  particle: (rnd: Rnd, compact: boolean) => Record<string, string>;
  /**
   * Optional: given a particle's generated style, return the style for a fixed "ground glow"
   * element (class `g`) pinned to the bottom of the card at that particle's origin (rising effects)
   * or impact column (falling effects). Copy `--dur`/`--delay` from the particle so the glow blooms
   * in sync; the module's css styles `.card-fx-<x> .g` + a keyframe. Consumers render one `g` per
   * particle (non-compact surfaces only). Omit for effects with no ground glow.
   */
  groundGlow?: (particle: Record<string, string>) => Record<string, string>;
}

/**
 * A TTS voice. costDust 0 = free for everyone; paid ones are bought like any cosmetic but are
 * chosen per submission in the compose form rather than equipped. The server maps `model` +
 * `speaker` to a piper invocation; web only shows labels and plays /api/tts/preview/:id.
 */
export interface TtsVoiceModule extends BaseModule {
  type: 'tts_voice';
  lang: TtsLang;
  gender: 'f' | 'm';
  /** Piper model basename in the voices dir (e.g. 'ru_RU-irina-medium'). */
  model: string;
  /** Speaker id inside a multi-speaker model (e.g. the Ukrainian one has 3 voices). */
  speaker?: number;
}

export type CosmeticModule = ColorModule | NickEffectModule | CardEffectModule | TtsVoiceModule;

/** What a user currently has equipped (one slot per category). */
export interface EquippedCosmetics {
  /** Free-form #rrggbb nickname color; requires owning the 'nick-color' item. */
  nickColor?: string | null;
  /**
   * Second gradient stop (#rrggbb); requires owning 'nick-gradient' AND a `nickColor` to ramp from.
   * Set = the name renders as a nickColor→nickColor2 gradient. The angle is deliberately NOT a
   * knob (see nick-gradient): viewers pick hues, we keep the geometry.
   */
  nickColor2?: string | null;
  /**
   * Animate the gradient (requires owning 'nick-flow' AND a `nickColor2` to drift between). Not a
   * slot of its own — it modifies the colour, so a flowing name keeps its nick effect too.
   */
  nickFlow?: boolean;
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
