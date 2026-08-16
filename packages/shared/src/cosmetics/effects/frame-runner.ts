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
  className: 'frame-fx-runner',
  labels: { name: 'shop.frameRunner', desc: 'shop.frameRunnerDesc' },
  css: `
.frame-fx-runner::after {
  background: conic-gradient(from var(--frame-ang), transparent 0 82%, #eafff8 91%, var(--cos-mint, #8df0cc) 95%, transparent 100%);
  animation: frame-run 7s linear infinite;
}
/* The glow travels WITH the runner: same conic gradient, same --frame-ang, same keyframe on a layer
   of its own, so the two can't drift apart — an inset shadow could only have lit a whole side.
 *
 * The tail runs THROUGH the seam (0% and 100% carry the same value) and fades over ~50° at each end.
 * That is not cosmetic tuning: a conic gradient's stops are RADII, so any quick drop in alpha shows
 * up as a straight cut across the card, and the tighter the drop the more it reads as a chopped
 * block. The runner's own arc gets away with a hard end because it is 2px wide; a glow cannot.
 *
 * ONE hue, varying only in alpha, for the same reason: a white core is the highest-contrast stop in
 * the ramp, so it is where that straight cut becomes visible first. The white point belongs to the
 * runner itself — repeating it out here bought nothing and cost the soft edge.
 *
 * And the gradient is turned half a turn with every stop moved the matching 50%, which paints the
 * IDENTICAL picture but puts the SEAM — the ray where a conic gradient wraps from 100% back to 0% —
 * in the dead zone. Equal colours across the seam are not enough: the slopes must match too, or the
 * kink reads as a hard line pointing at the card's centre. In the dead zone both sides are flat
 * zero, so there is nothing left to see. */
.frame-fx-runner::before {
  --frame-glow: conic-gradient(from calc(var(--frame-ang) + 180deg),
    transparent 0,
    transparent 18%,
    rgba(141, 240, 204, 0.05) 29%,
    rgba(141, 240, 204, 0.2) 39%,
    rgba(141, 240, 204, 0.42) 45%,
    rgba(141, 240, 204, 0.52) 48%,
    rgba(141, 240, 204, 0.3) 50%,
    rgba(141, 240, 204, 0.09) 57%,
    transparent 67%,
    transparent 100%);
  --frame-glow-mask: var(--frame-edge);
  animation: frame-run 7s linear infinite;
}
`,
};
