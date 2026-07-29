import type { EntranceModule } from '../types';

/**
 * The message arrives as FOUR of itself. Phantom copies are already standing at the destination when
 * the block is still off to the right; it slides in, they collapse into it one after another, and a
 * single message is left. An arrival that reads as time rather than motion — the copies are the same
 * block a few frames apart, not a trail of light.
 *
 * WHY THE PHANTOMS ARE `drop-shadow` AND NOT DOM. A module emits styles, never DOM (see the category
 * doc), so a duplicated block is off the table — and drop-shadow is the one thing in CSS that renders
 * a real SILHOUETTE of the element. Wrapped text, a card effect's particles, a seal in the corner: the
 * ghost is whatever the block actually is, at whatever size it happens to be. Nothing to keep in sync.
 *
 * THE CHAIN COMPOUNDS, AND THAT IS THE EFFECT. Each drop-shadow applies to the OUTPUT of the previous
 * one, so it also casts a shadow of the shadows: three functions give copies at every sum of their
 * offsets, with alphas multiplied. That is why the offsets grow (-30 / -62 / -96) instead of being
 * spaced evenly — the compounded extras land far out with alphas in the low hundredths and read as the
 * tail dying out. Read this as one authored trail, not three shadows: changing one offset moves more
 * copies than the one you edited.
 *
 * The phantoms LEAD the block instead of trailing it, which is the opposite of a motion wake and is
 * deliberate: a wake says the block flew in from the right, and we do not want a direction — we want
 * the same message at four moments, the earliest already home. That also keeps the copies inside the
 * block's own side of the frame, where a chat pill has room.
 *
 * `fill-mode: backwards`, not `both` — see entrance-warp: `both` would pin our last `filter` on the
 * block forever, and `filter` belongs to the surface once the arrival is over.
 *
 * 0.8s: the collapse needs three beats to be counted, where a single-copy arrival needs none. Still
 * under a second, because the chat overlay exists to be READ.
 */
export const entranceEcho: EntranceModule = {
  id: 'entrance-echo',
  type: 'entrance',
  // Entry shelf, level with glitch and warp. Three items at one price on purpose: they are the same
  // weight of effect on different axes (fault, speed, time), so the pick is taste, not budget.
  costDust: 2000,
  since: '2026-07-29',
  fx: 'echo',
  labels: { name: 'shop.entranceEcho', desc: 'shop.entranceEchoDesc' },
  css: `
[data-fx='echo'] {
  animation: cosfx-echo-in 0.8s cubic-bezier(0.12, 0.9, 0.2, 1) backwards;
}
@keyframes cosfx-echo-in {
  0% {
    opacity: 0;
    transform: translateX(96px);
    filter: drop-shadow(-30px 0 0 rgba(141, 240, 204, 0.55))
      drop-shadow(-62px 0 0 rgba(141, 240, 204, 0.3))
      drop-shadow(-96px 0 0 rgba(141, 240, 204, 0.14));
  }
  /* Fade in fast: the block has to be solid while the phantoms are still spread, or the whole run
     reads as one blurry object sliding rather than four copies converging. */
  12% {
    opacity: 1;
  }
  58% {
    transform: translateX(18px);
    filter: drop-shadow(-14px 0 0 rgba(141, 240, 204, 0.4))
      drop-shadow(-30px 0 0 rgba(141, 240, 204, 0.2))
      drop-shadow(-48px 0 0 rgba(141, 240, 204, 0.09));
  }
  /* Overshoots its place by a hair — the block passes THROUGH the last phantom rather than stopping
     politely behind it. */
  86% {
    transform: translateX(-4px);
    filter: drop-shadow(-3px 0 0 rgba(141, 240, 204, 0.16))
      drop-shadow(-7px 0 0 rgba(141, 240, 204, 0.07))
      drop-shadow(-11px 0 0 rgba(141, 240, 204, 0.03));
  }
  /* Explicit zeroed shadows rather than the 'none' keyword: interpolating a filter list against it is
     engine-dependent, and one that gets it wrong drops the phantoms in a single frame. */
  100% {
    opacity: 1;
    transform: none;
    filter: drop-shadow(0 0 0 rgba(141, 240, 204, 0)) drop-shadow(0 0 0 rgba(141, 240, 204, 0))
      drop-shadow(0 0 0 rgba(141, 240, 204, 0));
  }
}
`,
};
