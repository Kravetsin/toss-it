/**
 * Per-channel page theme: the streamer picks hues, we own lightness. Two knobs (accent hue,
 * backdrop hue+tint) drive every brand token on /c/:login; status colors (ok/warn/danger/info)
 * are deliberately NOT themable — the Vessel encodes submission state with them (see
 * features/channel/.../phaseConfig.ts), so a recolored `danger` would make "rejected" read wrong.
 *
 * Why hue-only: a streamer's bad accent hurts their VIEWERS (the send button is accent-colored),
 * unlike a nick color, which only hurts its owner. Fixing L keeps contrast >= 9 on every hue, so
 * no combination needs runtime validation — it is safe by construction.
 */
import { oklchHex } from './oklch';

export interface ChannelTheme {
  /** Accent hue in [0,360); null = brand mint, i.e. no theme set. */
  accentHue: number | null;
  /** Backdrop hue in [0,360); null = untinted (current neutral charcoal). */
  bgHue: number | null;
  /** Backdrop tint strength 0..100; 0 = neutral grey. */
  bgTint: number;
}

export const DEFAULT_THEME: ChannelTheme = { accentHue: null, bgHue: null, bgTint: 0 };

/** id of the `<style>` carrying the theme: the server inlines it (seo.ts), the channel page then
 *  owns it (useChannelTheme) so it can be dropped on unmount instead of leaking SPA-wide. */
export const THEME_STYLE_ID = 'ch-theme';

/** `== null` on purpose: an undefined hue must fall through here too, or resolveTheme would build
 *  colors from NaN and emit '#NaNNaNNaN', which setProperty accepts and every token then breaks. */
function tintOf(t: ChannelTheme): number {
  if (t.bgHue == null || !Number.isFinite(t.bgTint)) return 0;
  return (Math.max(0, Math.min(100, t.bgTint)) / 100) * TINT_MAX;
}

/** True when nothing would be overridden. Derived from resolveTheme rather than re-testing the
 *  knobs, so "default" can never drift from "emits no tokens". */
export function isDefaultTheme(t: ChannelTheme): boolean {
  return Object.keys(resolveTheme(t)).length === 0;
}

/**
 * Accent lightness. Held below the brand mint's own 0.884 so hues stay dense on the dark page
 * (at 0.884, warm/blue hues wash out to pastel — the gamut allows little chroma up there). The
 * trade: a channel's accent reads a touch heavier than the site default mint. Surface/text ramps
 * are measured off apps/web/src/index.css; every chroma is clamped into sRGB by oklchHex.
 */
const ACCENT = { L: 0.8, C: 0.13 };
const ACCENT_HOVER = { L: 0.83, C: 0.12 };
const ACCENT_CONTRAST = { L: 0.221, C: 0.034 };

/** OKLCH hue of the brand mint #8df0cc — the accent picker's neutral position. */
export const BRAND_HUE = 168.5;

const SURFACES = {
  'surface-2': 0.098,
  surface: 0.123,
  bg: 0.173,
  'bg-elevated': 0.2,
  border: 0.256,
  'border-strong': 0.316,
} as const;

const TEXTS = { text: 0.946, muted: 0.597, faint: 0.46 } as const;

/** Chroma the backdrop reaches at tint=100. Beyond this the "dark neutral" reads as a color cast. */
const TINT_MAX = 0.03;
/** Text stays closer to neutral than the surfaces behind it, or it starts to look stained. */
const TEXT_TINT = { text: 0.15, muted: 0.3, faint: 0.3 } as const;

export type ThemeTokens = Record<string, string>;

/**
 * Resolve a theme to `--color-*` token values. Only the knobs the streamer actually moved are
 * emitted: an untinted ramp regenerates to pure neutral greys (#101010), which is a visible shift
 * away from the hand-tuned ones in index.css (#0d1111) — so leaving a knob alone must emit nothing
 * for it rather than a "default" value. Derived tokens (accent-soft, glass-*) are color-mix over
 * these in index.css and follow automatically.
 */
export function resolveTheme(t: ChannelTheme): ThemeTokens {
  const tokens: ThemeTokens = {};
  const aHue = t.accentHue;
  if (aHue != null && Number.isFinite(aHue)) {
    tokens.accent = oklchHex(ACCENT.L, ACCENT.C, aHue);
    tokens['accent-hover'] = oklchHex(ACCENT_HOVER.L, ACCENT_HOVER.C, aHue);
    tokens['accent-contrast'] = oklchHex(ACCENT_CONTRAST.L, ACCENT_CONTRAST.C, aHue);
  }
  const tint = tintOf(t);
  const bHue = t.bgHue;
  if (tint > 0 && bHue != null) {
    for (const [name, L] of Object.entries(SURFACES)) tokens[name] = oklchHex(L, tint, bHue);
    for (const [name, L] of Object.entries(TEXTS)) {
      tokens[name] = oklchHex(L, tint * TEXT_TINT[name as keyof typeof TEXT_TINT], bHue);
    }
  }
  return tokens;
}

/**
 * A `:root` block overriding the themed tokens. MUST be injected after the Tailwind bundle's
 * own `:root` (same specificity — later wins), i.e. at the end of <head>, not in the SEO block.
 */
export function themeCss(t: ChannelTheme): string {
  const decls = Object.entries(resolveTheme(t))
    .map(([k, v]) => `--color-${k}:${v}`)
    .join(';');
  return decls ? `:root{${decls}}` : '';
}
