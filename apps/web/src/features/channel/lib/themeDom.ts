import { THEME_STYLE_ID, resolveTheme, themeCss, type ChannelTheme } from '@tmw/shared';
import { resetVesselTokens } from '../components/Vessel/tokens';
import { resetBurstColors } from '@/lib/burst';
import { recolorStars } from '@/components/BackgroundStars';

/** Every token resolveTheme can emit — the live preview must clear the ones a theme drops. */
const THEME_TOKENS = [
  'accent',
  'accent-hover',
  'accent-contrast',
  'surface-2',
  'surface',
  'bg',
  'bg-elevated',
  'border',
  'border-strong',
  'text',
  'muted',
  'faint',
] as const;

function resnapCanvasEngines(): void {
  resetVesselTokens();
  resetBurstColors();
  recolorStars();
}

/**
 * Fast path for the live preview: write the tokens as inline custom properties on :root instead of
 * rewriting a <style> — replacing stylesheet text re-parses the sheet on every slider step, which is
 * what made fast drags stutter. Inline props also outrank any stylesheet, so this wins over the
 * server-injected saved theme. Absent tokens are removed so they fall back to the default palette.
 */
export function applyChannelThemeVars(theme: ChannelTheme): void {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  for (const key of THEME_TOKENS) {
    const value = resolved[key];
    if (value) root.style.setProperty(`--color-${key}`, value);
    else root.style.removeProperty(`--color-${key}`);
  }
  resnapCanvasEngines();
}

/**
 * Apply a channel theme to the live document, synchronously. Writes (or clears) the
 * `<style id="ch-theme">` the server also inlines (seo.ts), then re-snapshots the canvas engines
 * that cache colors (Vessel liquid, burst particles, ambient stars) so they repaint in the new
 * accent. Synchronous on purpose: callers (useChannelTheme, the live preview) rely on the tokens
 * being current before the next React render reads them.
 */
export function applyChannelTheme(theme: ChannelTheme): void {
  const css = themeCss(theme);
  let el = document.getElementById(THEME_STYLE_ID);
  if (!css) {
    el?.remove();
  } else {
    if (!el) {
      el = document.createElement('style');
      el.id = THEME_STYLE_ID;
      document.head.appendChild(el);
    }
    if (el.textContent !== css) el.textContent = css;
  }
  resnapCanvasEngines();
}

/** Remove the theme style and restore the default palette (channel page unmount). */
export function clearChannelTheme(): void {
  document.getElementById(THEME_STYLE_ID)?.remove();
  resnapCanvasEngines();
}
