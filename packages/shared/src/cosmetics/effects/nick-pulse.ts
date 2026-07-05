import type { NickEffectModule } from '../types';

/**
 * Animated halo around the name in the nick color: the glow breathes, growing and shrinking on a
 * loop. Same `drop-shadow` approach as nick-glow (not text-shadow) so overflow truncation doesn't
 * clip it; the 0% keyframe keeps a visible glow so a paused animation still shows the effect.
 */
export const nickPulse: NickEffectModule = {
  id: 'nick-pulse',
  type: 'nick_effect',
  costDust: 2000,
  className: 'nick-pulse',
  labels: { name: 'shop.nickPulse', desc: 'shop.nickPulseDesc' },
  css: `
.nick-pulse {
  animation: nick-pulse 1.8s ease-in-out infinite alternate;
}

@keyframes nick-pulse {
  0% {
    filter: drop-shadow(0 0 2px var(--nick-glow, currentColor))
      drop-shadow(0 0 4px var(--nick-glow, currentColor));
  }
  100% {
    filter: drop-shadow(0 0 4px var(--nick-glow, currentColor))
      drop-shadow(0 0 12px var(--nick-glow, currentColor));
  }
}
`,
};
