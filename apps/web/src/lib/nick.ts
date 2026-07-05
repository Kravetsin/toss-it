import type { CSSProperties } from 'react';
import { nickEffectClass } from '@tmw/shared';

/**
 * className + inline style for rendering a nickname with its equipped nick cosmetics: color + nick
 * effect (glow, pulse, …). The effect class comes from the cosmetics registry, so any nick effect
 * works without branching here. Effects use the nick color via --nick-glow (falling back to the mint
 * accent) and render as a `filter: drop-shadow`, so they are NOT clipped by the nick's `truncate`.
 */
export function nickProps(
  color?: string | null,
  effect?: string | null,
): { className: string; style?: CSSProperties } {
  const fxClass = effect ? nickEffectClass(effect) : '';
  if (!color && !fxClass) return { className: '' };
  const style: CSSProperties = {};
  if (color) style.color = color;
  if (fxClass) (style as Record<string, string>)['--nick-glow'] = color || 'var(--color-accent)';
  return { className: fxClass, style };
}
