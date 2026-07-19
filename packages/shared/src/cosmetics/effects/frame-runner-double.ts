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
  animation: frame-run 2.1s linear infinite;
}
`,
};
