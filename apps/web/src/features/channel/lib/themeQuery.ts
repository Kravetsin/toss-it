import type { ChannelTheme } from '@tmw/shared';

/**
 * True only for the dashboard's live-preview embed (see ChannelThemeSettings). Requires BOTH the
 * flag and a real parent frame: the flag alone is public — anyone could link /c/x?themePreview=1
 * and get a frozen, postMessage-driven page. Resolved once per document (the embed loads a bare URL
 * and never client-navigates), so consumers can read it without re-parsing on every render.
 */
export const IS_THEME_PREVIEW =
  window.parent !== window && new URLSearchParams(window.location.search).has('themePreview');

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
