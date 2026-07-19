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
`,
};
