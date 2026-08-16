import type { FrameModule } from '../types';

/**
 * The runner's next tier: TWO glowing runners chasing around the border on opposite sides. Same pure-CSS
 * ring as frame-runner (structural `.frame-fx` + `@property --frame-ang` in the registry BASE_CSS), but
 * the conic-gradient carries two bright arcs 180° apart, and it spins a touch faster so it reads as the
 * busier, higher-tier frame. Still layered OVER the role colour — the frame's colour keeps saying WHO.
 */
export const frameRunnerDouble: FrameModule = {
  id: 'frame-runner-double',
  type: 'frame',
  // EARNED, not bought: 1000 chat messages on the account (see CosmeticItem.earn / the equip gate).
  costDust: 0,
  earn: { metric: 'messages', count: 1000 },
  className: 'frame-fx-double',
  labels: { name: 'shop.frameRunnerDouble', desc: 'shop.frameRunnerDoubleDesc' },
  css: `
.frame-fx-double::after {
  background: conic-gradient(from var(--frame-ang),
    #eafff8 0 2%, var(--cos-mint, #8df0cc) 5%, transparent 9% 50%,
    #eafff8 52% 54%, var(--cos-mint, #8df0cc) 57%, transparent 61% 100%);
  animation: frame-run 6s linear infinite;
}
/* One glow per runner, 180° apart, on the same variable and keyframe as the arcs above. Both tails
   fade over tens of degrees and the first one crosses the seam (0% equals 100%): a conic gradient's
   stops are radii, so a short fade is a straight cut across the card rather than a soft edge. Single
   hue for the same reason — the white core is where that cut showed up first, and the runners
   already carry the white point themselves.

   Rotated 122.4° with every stop moved the matching 34%, which is the same picture with the SEAM
   (where the gradient wraps 100% → 0%) parked in a dead zone. Matching colours across the seam is
   not enough — mismatched slopes leave a kink that reads as a line pointing at the card's centre. */
.frame-fx-double::before {
  --frame-glow: conic-gradient(from calc(var(--frame-ang) + 122.4deg),
    transparent 0,
    transparent 8%,
    rgba(141, 240, 204, 0.05) 15%,
    rgba(141, 240, 204, 0.3) 19.5%,
    rgba(141, 240, 204, 0.5) 21.5%,
    rgba(141, 240, 204, 0.24) 27%,
    rgba(141, 240, 204, 0.05) 35%,
    transparent 46%,
    transparent 57%,
    rgba(141, 240, 204, 0.16) 63%,
    rgba(141, 240, 204, 0.46) 66%,
    rgba(141, 240, 204, 0.24) 72%,
    rgba(141, 240, 204, 0.05) 80%,
    transparent 92%,
    transparent 100%);
  --frame-glow-mask: var(--frame-edge);
  animation: frame-run 6s linear infinite;
}
`,
};
