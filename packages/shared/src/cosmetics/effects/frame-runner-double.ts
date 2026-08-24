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
  colorUpgrade: 'frame-runner-double-color',
  className: 'frame-fx-double',
  labels: { name: 'shop.frameRunnerDouble', desc: 'shop.frameRunnerDoubleDesc' },
  css: `
/* WHITE IS THE CORE, COLOUR IS THE BODY: each arc runs colour → white-hot → colour and fades out at
   both ends, matching frame-runner and frame-dragon-breath. Two things were wrong before. The white
   was pinned to the arc's tail with the colour only ahead of it, so a recoloured runner still read as
   a white streak — and the first arc STARTED on the gradient's seam (solid white at 0%, flat
   transparent just before 100%), which butted full white against nothing and cut the tail off square.
 *
 * Both arcs are now centred at 25% and 75%, so the seam falls between them where the sweep is flat
 * transparent on both sides and has nothing to show. That is also why this needs none of the
 * rotate-and-shift trickery a seam-crossing arc would: the dead zone is where the seam already is. */
.frame-fx-double::after {
  background: conic-gradient(from var(--frame-ang),
    transparent 0 19%,
    rgb(var(--frame-rgb, 141, 240, 204)) 22%,
    #eafff8 25%,
    rgb(var(--frame-rgb, 141, 240, 204)) 28%,
    transparent 31% 69%,
    rgb(var(--frame-rgb, 141, 240, 204)) 72%,
    #eafff8 75%,
    rgb(var(--frame-rgb, 141, 240, 204)) 78%,
    transparent 81% 100%);
  animation: frame-run 6s linear infinite;
}
/* One glow per runner, centred on its arc, on the same variable and keyframe as the arcs above. Every
   tail fades over tens of degrees: a conic gradient's stops are radii, so a short fade is a straight
   cut across the card rather than a soft edge. Single hue for the same reason — the white core is
   where that cut showed up first, and the runners already carry the white point themselves. */
.frame-fx-double::before {
  --frame-glow: conic-gradient(from var(--frame-ang),
    transparent 0,
    transparent 9%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.05) 14%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.3) 20%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.5) 25%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.3) 30%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.05) 36%,
    transparent 41% 59%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.05) 64%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.3) 70%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.5) 75%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.3) 80%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.05) 86%,
    transparent 91%,
    transparent 100%);
  --frame-glow-mask: var(--frame-edge);
  animation: frame-run 6s linear infinite;
}
`,
};

/**
 * The colour UPGRADE for the double runner, earned at 1500 messages. Separate from the single
 * runner's: the two frames are separate items with separate tints, so one upgrade could only ever
 * paint one of them.
 */
export const frameRunnerDoubleColor: FrameModule = {
  id: 'frame-runner-double-color',
  type: 'frame',
  costDust: 0,
  earn: { metric: 'messages', count: 1500 },
  upgrade: true,
  since: '2026-08-21',
  className: '',
  labels: { name: 'shop.frameColorRunnerDouble', desc: 'shop.frameColorDesc' },
};
