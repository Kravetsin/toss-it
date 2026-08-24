import type { FrameModule } from '../types';

/**
 * A single glowing runner that chases around the message card's border, OVER its role colour — the
 * frame's colour still says WHO the sender is (broadcaster/mod/vip/sub); the runner is a separate
 * earned layer on top, never a recolour. Pure CSS: a conic-gradient bright arc rotated via an animated
 * `@property`, masked to a thin ring around the card (`border-radius: inherit` follows whatever radius
 * the surface's card uses). Rendered on a `.frame-fx` layer that is the first child of the (relative)
 * card, so it never fights the card's own pseudo-elements. Reduced motion parks it (applied per surface
 * too, but the css guards as well). Structural `.frame-fx` + `@property` live in the registry BASE_CSS.
 */
export const frameRunner: FrameModule = {
  id: 'frame-runner',
  type: 'frame',
  // EARNED, not bought: 500 chat messages on the account (see CosmeticItem.earn / the equip gate).
  costDust: 0,
  earn: { metric: 'messages', count: 500 },
  colorUpgrade: 'frame-runner-color',
  className: 'frame-fx-runner',
  labels: { name: 'shop.frameRunner', desc: 'shop.frameRunnerDesc' },
  css: `
/* WHITE IS THE CORE, COLOUR IS THE BODY — the arc runs colour → white-hot → colour and fades out at
   both ends, the way frame-dragon-breath is built. It used to ramp from transparent straight up to
   white and only then into the tint, which put the colour on the leading half alone and left the
   white sitting at the tail; a runner is one hot thing seen from both sides, not a two-tone dash.
   That is also what makes the colour upgrade legible: the tint has to flank the highlight, or a
   recoloured runner still reads as a white streak.

   The arc is CENTRED at 50%, away from the gradient's seam (the ray where it wraps 100% → 0%). Both
   ends of the sweep are flat transparent there, so the seam has nothing to show — which is why this
   needs none of the rotate-and-shift trickery that a seam-crossing arc would. */
.frame-fx-runner::after {
  background: conic-gradient(from var(--frame-ang),
    transparent 0 40%,
    rgb(var(--frame-rgb, 141, 240, 204)) 46%,
    #eafff8 50%,
    rgb(var(--frame-rgb, 141, 240, 204)) 54%,
    transparent 60% 100%);
  animation: frame-run 7s linear infinite;
}
/* The glow travels WITH the runner: same conic gradient, same --frame-ang, same keyframe on a layer
   of its own, so the two can't drift apart — an inset shadow could only have lit a whole side.
 *
 * Centred on the arc and fading over ~28° at each end. That is not cosmetic tuning: a conic
 * gradient's stops are RADII, so any quick drop in alpha shows up as a straight cut across the card,
 * and the tighter the drop the more it reads as a chopped block. The arc itself gets away with short
 * ramps because it is 2px wide; a glow that fills the box cannot.
 *
 * ONE hue, varying only in alpha: a white core is the highest-contrast stop in the ramp, so it is
 * where that straight cut becomes visible first. The white point belongs to the runner itself —
 * repeating it out here bought nothing and cost the soft edge. */
.frame-fx-runner::before {
  --frame-glow: conic-gradient(from var(--frame-ang),
    transparent 0,
    transparent 22%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.05) 29%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.2) 38%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.42) 45%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.52) 50%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.42) 55%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.2) 62%,
    rgba(var(--frame-rgb, 141, 240, 204), 0.09) 71%,
    transparent 78%,
    transparent 100%);
  --frame-glow-mask: var(--frame-edge);
  animation: frame-run 7s linear infinite;
}
`,
};

/**
 * The colour UPGRADE for the single runner: EARNED, like the runner itself — the next rung of the
 * same chat ladder (500 messages for the frame, 750 for the right to repaint it) rather than a
 * purchase, so the whole branch is paid for in the same currency. Never equipped on its own:
 * clearing the milestone turns on the picker (see FrameModule.colorUpgrade).
 */
export const frameRunnerColor: FrameModule = {
  id: 'frame-runner-color',
  type: 'frame',
  costDust: 0,
  earn: { metric: 'messages', count: 750 },
  upgrade: true,
  since: '2026-08-21',
  className: '',
  labels: { name: 'shop.frameColorRunner', desc: 'shop.frameColorDesc' },
};
