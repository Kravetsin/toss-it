/**
 * Resolve CSS theme tokens to RGB for canvas/SVG engine.
 * REDESIGN contract: read tokens once per session (avoid hardcoded hex in components).
 */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(h: string): Rgb {
  const s = h.replace('#', '').trim();
  const v =
    s.length === 3
      ? s
          .split('')
          .map((c) => c + c)
          .join('')
      : s;
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  };
}

export function mix(a: Rgb, b: Rgb, f: number): Rgb {
  return { r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f };
}

/** Blend toward white (meniscus gloss and bubbles). */
export function lighten(c: Rgb, f: number): Rgb {
  return { r: c.r + (255 - c.r) * f, g: c.g + (255 - c.g) * f, b: c.b + (255 - c.b) * f };
}

export function rgbStr(c: Rgb): string {
  return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;
}

export function rgba(c: Rgb, a: number): string {
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
}

export type ColorToken =
  | 'accent'
  | 'accentHover'
  | 'accentContrast'
  | 'info'
  | 'ok'
  | 'warn'
  | 'danger'
  | 'mutedmint';

let cache: Record<ColorToken, Rgb> | null = null;

export function tokens(): Record<ColorToken, Rgb> {
  if (cache) return cache;
  const FALLBACK = '#8df0cc';
  if (typeof window === 'undefined') {
    const a = hexToRgb(FALLBACK);
    cache = {
      accent: a,
      accentHover: a,
      accentContrast: hexToRgb('#06201a'),
      info: a,
      ok: a,
      warn: a,
      danger: a,
      mutedmint: a,
    };
    return cache;
  }
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fb: string) => hexToRgb(cs.getPropertyValue(name).trim() || fb);
  const accent = get('--color-accent', FALLBACK);
  const muted = get('--color-muted', '#7a8180');
  cache = {
    accent,
    accentHover: get('--color-accent-hover', '#a6f4d8'),
    accentContrast: get('--color-accent-contrast', '#06201a'),
    info: get('--color-info', '#a5b4fc'),
    ok: get('--color-ok', '#34d399'),
    warn: get('--color-warn', '#ffdb2a'),
    danger: get('--color-danger', '#fb5b6e'),
    mutedmint: mix(accent, muted, 0.5),
  };
  return cache;
}
