import type { CSSProperties } from 'react';
import { nickRender, type NickCosmetics } from '@tmw/shared';

/**
 * className + inline style for rendering a nickname with its equipped nick cosmetics: colour (or a
 * two-stop gradient, optionally drifting) + nick effect. All of it comes from the shared,
 * render-independent `nickRender`, so the channel page, the overlays and a future Twitch-chat
 * extension paint the same name identically — keep the logic there, not here.
 */
export function nickProps(n: NickCosmetics): { className: string; style?: CSSProperties } {
  const { className, style } = nickRender(n);
  if (!className && Object.keys(style).length === 0) return { className: '' };
  return { className, style: style as CSSProperties };
}
