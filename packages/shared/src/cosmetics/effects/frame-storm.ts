import type { FrameModule } from '../types';

/**
 * Lightning that lands somewhere rather than everywhere: a strike lights one side of the ring, dies,
 * and the next one comes from the other side — same relocate-in-the-dark trick as the embers, so the
 * flash never appears to slide across. One strike every five seconds, alternating sides.
 *
 * Each strike is a PAIR of flashes a beat apart: a single one reads as a rendering glitch, two read
 * as lightning. A dim ring underneath keeps the frame present between strikes; the animation only
 * moves alpha and a gradient centre, neither of which is pixel-quantised.
 */
export const frameStorm: FrameModule = {
  id: 'frame-storm',
  type: 'frame',
  // EARNED, not bought: 6000 watch-minutes (100h) account-wide — top of the watch axis.
  costDust: 0,
  earn: { metric: 'watchMinutes', count: 6000 },
  since: '2026-07-23',
  className: 'frame-fx-storm',
  labels: { name: 'shop.frameStorm', desc: 'shop.frameStormDesc' },
  css: `
@property --storm-x {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 22%;
}
@property --storm-a {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}
.frame-fx-storm::after {
  background:
    radial-gradient(ellipse 52% 150% at var(--storm-x) 50%,
      rgba(236, 243, 255, var(--storm-a)),
      rgba(150, 170, 255, calc(var(--storm-a) * 0.5)) 42%,
      transparent 78%),
    linear-gradient(90deg,
      rgba(120, 140, 235, 0.16),
      rgba(150, 170, 255, 0.24),
      rgba(120, 140, 235, 0.16));
  animation: frame-storm-strike 10s linear infinite;
}
/* Two strikes per lap, ~5s apart, on opposite sides. The side swaps at 50% and at the loop seam,
   both moments where alpha is 0 — the bolt is never seen crossing the card. */
@keyframes frame-storm-strike {
  0%, 18% {
    --storm-a: 0;
    --storm-x: 22%;
  }
  19.5% {
    --storm-a: 1;
    --storm-x: 22%;
  }
  21% {
    --storm-a: 0.06;
    --storm-x: 22%;
  }
  23% {
    --storm-a: 0.85;
    --storm-x: 22%;
  }
  26%, 48% {
    --storm-a: 0;
    --storm-x: 22%;
  }
  52%, 68% {
    --storm-a: 0;
    --storm-x: 78%;
  }
  69.5% {
    --storm-a: 1;
    --storm-x: 78%;
  }
  71% {
    --storm-a: 0.06;
    --storm-x: 78%;
  }
  73% {
    --storm-a: 0.9;
    --storm-x: 78%;
  }
  76%, 100% {
    --storm-a: 0;
    --storm-x: 78%;
  }
}
`,
};
