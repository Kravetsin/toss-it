import type { FrameModule } from '../types';

/**
 * Lightning that lands somewhere rather than everywhere: a strike lights one side of the ring, dies,
 * and the next one comes from the other side — same relocate-in-the-dark trick as the embers, so the
 * flash never appears to slide across. One strike every five seconds, alternating sides.
 *
 * Each strike is a PAIR of flashes a beat apart: a single one reads as a rendering glitch, two read
 * as lightning. A dim ring underneath keeps the frame present between strikes; the animation only
 * moves alpha and a gradient centre, neither of which is pixel-quantised.
 *
 * FOUR strikes per 7s, not two per 10s. This frame is meant to be nearly gone between bolts, so the
 * fix for "you never see it" is frequency, not a brighter ring — a ring lit all the time would just
 * be a coloured border. Each strike now trails a short afterglow, and the bolt spans more of the
 * side so it lights a whole flank rather than a patch.
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
    radial-gradient(ellipse 64% 165% at var(--storm-x) 50%,
      rgba(253, 254, 255, var(--storm-a)),
      rgba(186, 205, 255, calc(var(--storm-a) * 0.55)) 38%,
      transparent 78%),
    linear-gradient(90deg,
      rgba(120, 140, 235, 0.16),
      rgba(150, 170, 255, 0.24),
      rgba(120, 140, 235, 0.16));
  animation: frame-storm-strike 7s linear infinite;
}
/* The bolt lights the card itself. No side to hang this on — the strike moves — so the glow is even
   and reads its brightness straight off --storm-a; running the same keyframe here is what gives this
   layer that variable, and both pseudo-elements start together, so they can't drift apart. */
.frame-fx-storm::before {
  box-shadow: inset 0 0 18px -2px rgba(180, 200, 255, 0.9);
  opacity: var(--storm-a, 0);
  animation: frame-storm-strike 7s linear infinite;
}
/* Four strikes a lap, each a pair of flashes plus a short afterglow, landing on a different column
   every time. Every move of --storm-x sits between two keyframes that both pin alpha at 0, so the
   bolt relocates in the dark and is never seen crossing the card. */
@keyframes frame-storm-strike {
  0% {
    --storm-a: 0;
    --storm-x: 22%;
  }
  6% {
    --storm-a: 1;
    --storm-x: 22%;
  }
  7.5% {
    --storm-a: 0.08;
    --storm-x: 22%;
  }
  9% {
    --storm-a: 0.92;
    --storm-x: 22%;
  }
  12% {
    --storm-a: 0.3;
    --storm-x: 22%;
  }
  20% {
    --storm-a: 0.06;
    --storm-x: 22%;
  }
  24%, 26% {
    --storm-a: 0;
    --storm-x: 78%;
  }
  32% {
    --storm-a: 1;
    --storm-x: 78%;
  }
  33.5% {
    --storm-a: 0.08;
    --storm-x: 78%;
  }
  35% {
    --storm-a: 0.95;
    --storm-x: 78%;
  }
  38% {
    --storm-a: 0.32;
    --storm-x: 78%;
  }
  46% {
    --storm-a: 0.06;
    --storm-x: 78%;
  }
  50%, 52% {
    --storm-a: 0;
    --storm-x: 36%;
  }
  58% {
    --storm-a: 0.95;
    --storm-x: 36%;
  }
  59.5% {
    --storm-a: 0.08;
    --storm-x: 36%;
  }
  61% {
    --storm-a: 1;
    --storm-x: 36%;
  }
  64% {
    --storm-a: 0.3;
    --storm-x: 36%;
  }
  72% {
    --storm-a: 0.05;
    --storm-x: 36%;
  }
  75%, 77% {
    --storm-a: 0;
    --storm-x: 64%;
  }
  83% {
    --storm-a: 1;
    --storm-x: 64%;
  }
  84.5% {
    --storm-a: 0.08;
    --storm-x: 64%;
  }
  86% {
    --storm-a: 0.9;
    --storm-x: 64%;
  }
  89% {
    --storm-a: 0.28;
    --storm-x: 64%;
  }
  97% {
    --storm-a: 0.04;
    --storm-x: 64%;
  }
  100% {
    --storm-a: 0;
    --storm-x: 64%;
  }
}
`,
};
