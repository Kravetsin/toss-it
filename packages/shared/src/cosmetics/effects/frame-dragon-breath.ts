import type { FrameModule } from '../types';

/**
 * Top of the chat-message ladder (runner → twin runners → this). Still the shared ring, but a single
 * WIDE arc that ramps ember → flame → white-hot at the leading edge and cools back to ash, dying out
 * before the halfway mark — so the ring never closes and reads as something that swept past rather
 * than a light doing laps. Its glow breathes on a cycle deliberately unrelated to the lap time, which
 * is what makes it feel alive instead of mechanical.
 */
export const frameDragonBreath: FrameModule = {
  id: 'frame-dragon-breath',
  type: 'frame',
  // EARNED, not bought: 2000 chat messages on the account (see CosmeticItem.earn / the equip gate).
  costDust: 0,
  earn: { metric: 'messages', count: 2000 },
  since: '2026-07-22',
  className: 'frame-fx-dragon-breath',
  labels: { name: 'shop.frameDragonBreath', desc: 'shop.frameDragonBreathDesc' },
  css: `
.frame-fx-dragon-breath::after {
  background: conic-gradient(from var(--frame-ang),
    transparent 0 4%,
    #5c0f02 8%,
    #c92a0c 16%,
    #ff6a00 24%,
    #ffb347 30%,
    #fff3c4 34%,
    #ff6a00 39%,
    #c92a0c 44%,
    transparent 50% 100%);
  animation: frame-run 5s linear infinite, frame-dragon-breath-pulse 2.4s ease-in-out infinite;
}
/* Heat around the arc, riding the same angle: it ramps and dies with the breath rather than lighting
   an edge, and it breathes on the arc's own pulse so the glow and the flame stay one thing. */
.frame-fx-dragon-breath::before {
  /* Follows the arc's own ramp, but every fade is stretched over tens of degrees: a conic gradient's
     stops are radii, so a short fade lands on the card as a straight cut instead of a soft edge.
     The arc's white-hot point is deliberately NOT repeated here — the brightest stop is where that
     cut shows up first, and the flame already owns that highlight. Rotated 306° with every stop
     moved the matching 85%: identical picture, but the SEAM (the ray where the gradient wraps
     100% → 0%) sits in the dead zone, where both sides are flat zero and its kink cannot show. */
  --frame-glow: conic-gradient(from calc(var(--frame-ang) + 306deg),
    transparent 0,
    transparent 15%,
    rgba(201, 42, 12, 0.05) 21%,
    rgba(201, 42, 12, 0.2) 31%,
    rgba(255, 106, 0, 0.4) 41%,
    rgba(255, 150, 40, 0.52) 49%,
    rgba(255, 120, 10, 0.38) 57%,
    rgba(201, 42, 12, 0.14) 67%,
    rgba(201, 42, 12, 0.03) 77%,
    transparent 89%,
    transparent 100%);
  --frame-glow-mask: var(--frame-edge);
  animation: frame-run 5s linear infinite, frame-dragon-breath-glow 2.4s ease-in-out infinite;
}
@keyframes frame-dragon-breath-glow {
  0%, 100% {
    opacity: 0.65;
  }
  50% {
    opacity: 1;
  }
}
@keyframes frame-dragon-breath-pulse {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(255, 106, 0, 0.35));
  }
  50% {
    filter: drop-shadow(0 0 5px rgba(255, 80, 0, 0.7));
  }
}
`,
};
