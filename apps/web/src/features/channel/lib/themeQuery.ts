import type { ChannelTheme } from '@tmw/shared';

/** The channel page is embedded as a live theme preview when this flag is present (see
 *  ChannelThemeSettings). Read from the URL, not router state — the iframe loads a bare URL. */
export function isThemePreview(): boolean {
  return new URLSearchParams(window.location.search).has('themePreview');
}

const num = (p: URLSearchParams, key: string): number | null => {
  const raw = p.get(key);
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

/** Seed the preview from the URL so the first paint already matches the editor, before the parent's
 *  first postMessage arrives. */
export function themeFromQuery(): ChannelTheme {
  const p = new URLSearchParams(window.location.search);
  return { accentHue: num(p, 'accentHue'), bgHue: num(p, 'bgHue'), bgTint: num(p, 'bgTint') ?? 0 };
}
