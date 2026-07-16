import { useLayoutEffect, useState } from 'react';
import { THEME_STYLE_ID, type ChannelTheme } from '@tmw/shared';
import {
  applyChannelTheme,
  applyChannelThemeVars,
  clearChannelTheme,
  clearChannelThemeVars,
} from '../lib/themeDom';

/**
 * Applies a channel's page theme and — crucially — removes it on unmount. The tokens live on
 * `:root` (the canvas engines read them off documentElement), so without the cleanup a client-side
 * nav off the channel page would leave the whole SPA wearing this channel's colors.
 *
 * On a full page load the server already inlined the same `<style id="ch-theme">` (seo.ts), so the
 * first paint is already themed; this hook then keeps it in sync.
 */
export function useChannelTheme(theme: ChannelTheme | null | undefined): void {
  const key = theme ? `${theme.accentHue}|${theme.bgHue}|${theme.bgTint}` : '';
  useLayoutEffect(() => {
    if (!theme) return;
    applyChannelTheme(theme);
    return clearChannelTheme;
  }, [key]);
}

/**
 * Live theme preview for an iframe embed (see ChannelThemeSettings): the parent dashboard posts
 * `{ type: 'tossit:theme', theme }` on every slider move; we apply it synchronously so all CSS
 * surfaces update instantly, then bump state to re-render the page — the Vessel reads its color
 * from tokens at render, so it repaints in step with the canvas engines.
 */
export function useThemePreviewListener(enabled: boolean, initial: ChannelTheme): void {
  const [, setTheme] = useState(initial);
  useLayoutEffect(() => {
    if (!enabled) return;
    // Drop the server's saved-theme <style>: inline vars are the only source here, so clearing a
    // token falls back to the default palette rather than to whatever is saved on the channel.
    document.getElementById(THEME_STYLE_ID)?.remove();
    applyChannelThemeVars(initial);
    // Animations: one animated pixel re-composites the whole scaled iframe layer every frame.
    // Transitions: they ease colors in over ~150ms, so a fast drag lags and overshoots the hue.
    const freeze = document.createElement('style');
    freeze.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
    document.head.appendChild(freeze);
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string; theme?: ChannelTheme } | null;
      if (data?.type !== 'tossit:theme' || !data.theme) return;
      applyChannelThemeVars(data.theme); // sync: tokens current before the re-render below reads them
      setTheme(data.theme);
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      freeze.remove();
      // Same reason useChannelTheme cleans up: these tokens live on :root, so leaving them behind
      // would repaint the whole SPA in this preview's colors after a client-side nav away.
      clearChannelThemeVars();
    };
  }, [enabled]);
}
