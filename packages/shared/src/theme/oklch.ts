/**
 * Minimal OKLCH <-> sRGB conversion for the channel theme (see ./channelTheme.ts).
 * OKLab keeps perceived lightness constant across hues, which is what makes a hue-only
 * picker safe: fix L, and contrast against the dark page holds on every hue.
 * Formulas: Björn Ottosson's OKLab (https://bottosson.github.io/posts/oklab/).
 */

/** Linear-light channel -> sRGB gamma-encoded. */
function encode(c: number): number {
  return c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
}

/** sRGB gamma-encoded channel -> linear-light. */
function decode(c: number): number {
  return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

type Rgb = [number, number, number];

function oklabToLinearSrgb(L: number, a: number, b: number): Rgb {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearSrgbToOklab(r: number, g: number, b: number): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Small epsilon: gamut checks run on floats that land a hair outside [0,1] when exact. */
const EPS = 0.0005;

function inGamut([r, g, b]: Rgb): boolean {
  return r >= -EPS && r <= 1 + EPS && g >= -EPS && g <= 1 + EPS && b >= -EPS && b <= 1 + EPS;
}

function polar(chroma: number, hue: number): [number, number] {
  const rad = (hue * Math.PI) / 180;
  return [chroma * Math.cos(rad), chroma * Math.sin(rad)];
}

/**
 * Largest chroma that still fits in sRGB at this lightness/hue. The gamut is wildly
 * asymmetric — at L=0.88 green reaches ~0.23 but blue only ~0.06 — so chroma can never be a
 * fixed constant across hues; callers clamp against this. Monotonic in C, hence bisection.
 */
export function maxChroma(L: number, hue: number): number {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToLinearSrgb(L, ...polar(mid, hue)))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** OKLCH -> #rrggbb, chroma clamped into sRGB so every hue yields a real color. */
export function oklchHex(L: number, chroma: number, hue: number): string {
  const c = Math.min(chroma, maxChroma(L, hue));
  return (
    '#' +
    oklabToLinearSrgb(L, ...polar(c, hue))
      .map((v) => {
        const n = Math.round(Math.max(0, Math.min(1, encode(v))) * 255);
        return n.toString(16).padStart(2, '0');
      })
      .join('')
  );
}

/** #rgb / #rrggbb -> OKLCH hue in [0,360). Returns null for greys (no meaningful hue). */
export function hexToHue(hex: string): number | null {
  const s = hex.replace('#', '').trim();
  const full =
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const [r, g, b] = [0, 2, 4].map((i) => decode(parseInt(full.slice(i, i + 2), 16) / 255)) as Rgb;
  const [, a, bb] = linearSrgbToOklab(r, g, b);
  if (Math.hypot(a, bb) < 0.004) return null;
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}
