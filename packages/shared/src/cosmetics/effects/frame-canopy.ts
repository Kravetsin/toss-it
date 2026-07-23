import type { FrameModule } from '../types';

/**
 * Green light filtering down from overhead: the only schematic frame that lives on the TOP edge, so
 * it reads as something above the card rather than under it. Deliberately not called a vine — the
 * drawn vines are their own family on the watch-time axis, and reusing the name would make two
 * unrelated things look like rungs of one ladder.
 *
 * Two patches drift in OPPOSITE directions off a single animated variable (the second one is derived
 * with calc), so they pass each other instead of marching in step — one shared animation, but the
 * motion never looks like a single object sliding.
 */
export const frameCanopy: FrameModule = {
  id: 'frame-canopy',
  type: 'frame',
  // EARNED, not bought: 1500 watch-minutes (25h) account-wide — the entry rung of the watch axis.
  costDust: 0,
  earn: { metric: 'watchMinutes', count: 1500 },
  since: '2026-07-23',
  className: 'frame-fx-canopy',
  labels: { name: 'shop.frameCanopy', desc: 'shop.frameCanopyDesc' },
  css: `
@property --canopy-x {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 30%;
}
.frame-fx-canopy::after {
  background:
    radial-gradient(ellipse 30% 58% at var(--canopy-x) 0%,
      rgba(150, 225, 135, 0.9),
      rgba(52, 110, 58, 0.34) 46%,
      transparent 74%),
    radial-gradient(ellipse 26% 50% at calc(100% - var(--canopy-x) * 0.72) 0%,
      rgba(118, 196, 110, 0.75),
      rgba(44, 96, 50, 0.3) 48%,
      transparent 76%),
    radial-gradient(ellipse 122% 34% at 50% 0%,
      rgba(38, 84, 44, 0.4),
      transparent 70%);
  animation: frame-canopy-drift 13s ease-in-out infinite;
}
@keyframes frame-canopy-drift {
  0%, 100% {
    --canopy-x: 18%;
  }
  50% {
    --canopy-x: 74%;
  }
}
`,
};
