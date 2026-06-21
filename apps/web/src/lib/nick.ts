import type { CSSProperties } from 'react';

/**
 * className + inline style for rendering a nickname with its equipped nick cosmetics:
 * color + nick effect (glow). The glow uses the nick color (--nick-glow), falling back to
 * the mint accent. Glow is a `filter: drop-shadow` (see .nick-glow) so it is NOT clipped by
 * the nick's own `truncate` overflow.
 */
export function nickProps(
  color?: string | null,
  effect?: string | null,
): { className: string; style?: CSSProperties } {
  const glow = effect === 'nick-glow';
  if (!color && !glow) return { className: '' };
  const style: CSSProperties = {};
  if (color) style.color = color;
  if (glow) (style as Record<string, string>)['--nick-glow'] = color || 'var(--color-accent)';
  return { className: glow ? 'nick-glow' : '', style };
}
