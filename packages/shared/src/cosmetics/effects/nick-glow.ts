import type { NickEffectModule } from '../types';

/**
 * Soft halo around the name in the nick color. Uses `filter: drop-shadow` (not text-shadow) so a
 * truncated name's overflow doesn't clip the glow. `--nick-glow` / `--nick-glow-2` are set on the
 * element by nickRender (the gradient's two stops, or the same color twice); they fall back to the
 * current text color. Outer halo takes stop 2 so a gradient name's glow echoes its ramp.
 */
export const nickGlow: NickEffectModule = {
  id: 'nick-glow',
  type: 'nick_effect',
  costDust: 1500,
  className: 'nick-glow',
  labels: { name: 'shop.nickGlow', desc: 'shop.nickGlowDesc' },
  css: `
.nick-glow {
  filter: drop-shadow(0 0 3px var(--nick-glow, currentColor))
    drop-shadow(0 0 8px var(--nick-glow-2, var(--nick-glow, currentColor)));
}
`,
};
