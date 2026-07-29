import type { EntranceModule } from '../types';

/**
 * The message arrives out of NOTHING: a hairline of light snaps to the block's full width, holds for a
 * beat, then unfolds vertically into the message and the light drains off it. A CRT switching on, run
 * backwards — the fastest arrival in the category, and the only one whose whole story is a single axis
 * opening after the other.
 *
 * The block moves AS ONE (the category's rule): everything here is `transform` + `filter` on the
 * arriving element, and nothing inside it is touched. The two scale axes are deliberately sequenced
 * rather than eased together — a simultaneous scale is a plain zoom, which every UI on earth already
 * does; holding scaleY flat while scaleX completes is what makes it read as a line of light that
 * BECOMES a message.
 *
 * WHY THE GLOW IS `drop-shadow` AND NOT `box-shadow`. Same trap glitch documents for text-shadow:
 * these are single properties, and a surface already spends box-shadow on the bubble's legibility
 * plate. Animating it would delete that plate for the run — and with `fill-mode: both` the last
 * keyframe would keep it deleted forever. `filter` is a property the surfaces don't use on the block,
 * so borrowing it costs nothing, and drop-shadow follows the SILHOUETTE — the glow squashes with the
 * line instead of staying a rounded rectangle around a 2px sliver.
 *
 * `fill-mode: backwards`, not `both`, for the same reason: backwards holds frame 0 before the run (no
 * flash of the un-animated block, since applyEntrance runs before paint) and then hands every property
 * back to the surface when it ends. Nothing of ours outlives the arrival.
 *
 * 0.72s: short because the chat overlay exists to be READ. The block is legible from 64% — the last
 * third is only the light letting go.
 */
export const entranceWarp: EntranceModule = {
  id: 'entrance-warp',
  type: 'entrance',
  // Entry shelf, level with glitch: a sub-second CSS one-shot, priced as the affordable way INTO the
  // category rather than against the canvas showpieces above it.
  costDust: 2000,
  since: '2026-07-29',
  fx: 'warp',
  labels: { name: 'shop.entranceWarp', desc: 'shop.entranceWarpDesc' },
  css: `
[data-fx='warp'] {
  /* The viewer's entrance colour, set on the element by applyEntrance; the brand mint when they own no
     colour upgrade. Aliased once because the keyframes below need it at four different strengths, and
     color-mix wants a colour, not an rgba() the tint can't be substituted into. */
  --warp-tint: var(--cos-fx-tint, var(--cos-mint, #8df0cc));
  animation: cosfx-warp-in 0.72s cubic-bezier(0.16, 0.84, 0.3, 1) backwards;
}
@keyframes cosfx-warp-in {
  /* A point of light, off-white hot. Brightness is what sells it as LIGHT rather than a squashed card:
     at 2% height the block's own colours are a single dim row of pixels. */
  0% {
    opacity: 0;
    transform: scaleX(0.04) scaleY(0.018);
    filter: brightness(3.4) drop-shadow(0 0 14px color-mix(in srgb, var(--warp-tint) 85%, transparent));
  }
  /* The line snaps to width with a hair of overshoot — the only bit of elasticity in the run. */
  16% {
    opacity: 1;
    transform: scaleX(1.03) scaleY(0.018);
    filter: brightness(2.6) drop-shadow(0 0 18px color-mix(in srgb, var(--warp-tint) 70%, transparent));
  }
  /* The hold. Without it the two axes read as one diagonal zoom and the line never registers. */
  32% {
    transform: scaleX(1) scaleY(0.018);
    filter: brightness(2.4) drop-shadow(0 0 16px color-mix(in srgb, var(--warp-tint) 60%, transparent));
  }
  /* Unfolds past full height, so the settle is a bounce and not a stop. */
  64% {
    transform: scaleX(1) scaleY(1.09);
    filter: brightness(1.3) drop-shadow(0 0 10px color-mix(in srgb, var(--warp-tint) 30%, transparent));
  }
  82% {
    transform: scaleY(0.97);
  }
  100% {
    opacity: 1;
    transform: none;
    filter: none;
  }
}
`,
};
