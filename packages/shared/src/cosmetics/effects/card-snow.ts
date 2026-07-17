import { DEPTH_BLUR_RATIO_POINT, depthCount, depthPlane, parallaxDur } from '../depth';
import type { CardEffectModule } from '../types';

/**
 * Soft white flakes falling down the card, each leaving a faint line of light where it settles on
 * the bottom edge — reads as calm "snow", distinct from levitation's fast upward rise. Fixed white
 * color (not the accent). The sideways sway returns to the spawn column at the end so the flake and
 * its glow line up.
 *
 * DEPTH (see ../depth): the effect this fits best in the whole catalog — a defocused point of light
 * IS a bokeh ball, so the near plane costs nothing in legibility (unlike sakura, where blur eats a
 * petal's shape; a flake has no shape to lose). That is also why it takes the POINT blur ratio: with
 * no outline to read, softness is the only thing separating a defocused flake from a big one.
 *
 * Snow is the effect where speed-from-size matters MOST, and where getting it wrong showed first:
 * flakes have no wind alibi. A petal drifting oddly reads as a gust; a big flake sinking slower than
 * the small one beside it reads as broken. Hence a narrow jitter here — snow keeps to its physics.
 *
 * Two things sakura needed and this one must NOT copy: `saturate` (white has no saturation — the
 * filter is a no-op on it) and a size-scaled bloom (the flake's box-shadow rides a scale transform,
 * so it already grows with it, while sakura's px width left its shadow behind).
 *
 * The fall is a `translate`, NOT `top`: `top` is a layout property snapped to whole pixels, and in a
 * 40px leaderboard row a ~4.5s fall covers ~45px — roughly 10 one-pixel jumps a second, i.e. visible
 * stepping. The faster effects hide that behind speed; a calm one cannot, so it goes through the
 * compositor instead, which is subpixel-accurate at any speed (and is why this needs no `.compact`
 * variant).
 *
 * `.p` is an invisible full-height COLUMN and `::before` is the flake. That shape is what lets the
 * fall be a `%` translate: percentages resolve against the element's own box at used-value time, so
 * a column that is `height: 100%` of the layer re-measures on every layout. Container units (cqh)
 * looked equivalent but are resolved when the keyframes are computed and don't reliably recompute
 * on a mere container RESIZE — an expanding dashboard card left flakes falling only as far as its
 * collapsed height.
 */
export const cardSnow: CardEffectModule = {
  id: 'card-snow',
  type: 'card_effect',
  costDust: 3000,
  className: 'card-fx-snow',
  // In-focus density; depthCount adds the off-focus planes on top rather than out of it (../depth).
  counts: { web: depthCount(12), overlayCard: depthCount(9), overlayChat: depthCount(8) },
  labels: { name: 'shop.cardSnow', desc: 'shop.cardSnowDesc' },
  particle: (rnd, compact, index) => {
    const plane = depthPlane(index);
    // A 3px flake × --s. The near bump is deliberately modest and the blur does the talking: for a
    // point of light, growing the disc IS the defocus, so some growth is not optional — but past a
    // point a big crisp ball just reads as a big flake, and softness is cheaper than size.
    const nearS = compact ? rnd(1.5, 2) : rnd(1.8, 2.6);
    const s = plane === 'near' ? nearS : plane === 'far' ? rnd(0.35, 0.6) : rnd(0.5, 1.4);
    // Free to be calm again: a composited translate costs no smoothness at low speed.
    const dur = parallaxDur(5.5, s, rnd(0.92, 1.08));
    return {
      left: `${rnd(2, 98).toFixed(1)}%`,
      '--drift': `${(rnd(-22, 22) * (plane === 'near' ? 1.6 : plane === 'far' ? 0.5 : 1)).toFixed(0)}px`,
      '--s': s.toFixed(2),
      // Blur tracks the flake's RENDERED size (3px × --s), which is what keeps one lens across planes.
      '--blur': `${(3 * s * DEPTH_BLUR_RATIO_POINT[plane]).toFixed(2)}px`,
      // Distance dims, but only the far plane: a blurred white dot that is ALSO faded just turns
      // grey and reads as dirt rather than snow (the mistake sakura's near plane made first).
      '--op': plane === 'far' ? '0.6' : '0.8',
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Faint line at the flake's column, blooming as it settles at the bottom (drift returns to 0
  // there). In-focus plane only: a flake floating in front of the lens never lands on the card.
  groundGlow: (p) => ({
    ...(p['--blur'] === '0.00px' ? {} : { display: 'none' }),
    left: p.left ?? '50%',
    '--dur': p['--dur'] ?? '4.5s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
/* The falling column: invisible, zero-width, exactly as tall as the layer — which is what makes a
   % translate below mean "% of the card" and re-measure whenever the card resizes. */
.card-fx-snow .p {
  top: 0;
  width: 0;
  height: 100%;
  /* Defocus on the column: the flake's own scale is a transform, so blurring here is measured in
     screen px and stays predictable no matter how big --s makes the flake. */
  filter: blur(var(--blur, 0));
  animation: cardfx-snow-fall var(--dur, 5.5s) linear var(--delay, 0s) infinite;
}
/* The flake itself rides inside the column; --s is its per-flake size. The sway lives here, on the
   flake, and not on the column's fall — see the header. Same --dur/--delay, so it is still back in
   the spawn column at landing and the settle glow lines up. */
.card-fx-snow .p::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.75);
  scale: var(--s, 1);
  animation: cardfx-snow-sway var(--dur, 5.5s) ease-in-out var(--delay, 0s) infinite;
}
/* Pure vertical: -8% → 104% of the column (= of the card), linear, no midpoint stop needed.
   The flake ENTERS from above the edge. -8% alone only lifted the column 8% of the card — on a 40px
   row that is 3px, so a near-plane flake hung into frame and then FADED IN there, blooming out of
   nothing a few px inside. The extra 3px×--s is the flake's own rendered size (the ::before is a 3px
   box wearing --s), which is the one distance that clears it on any card at any plane; the layer's
   overflow clip does the reveal. It still fades out at the bottom — that fade IS the settling, and
   the ground glow blooms into it. Opacity stays in the keyframes so animation-less reduced-motion
   still falls back to the base 0. */
@keyframes cardfx-snow-fall {
  0% {
    translate: 0 calc(-8% - 3px * var(--s, 1));
    opacity: var(--op, 0.8);
  }
  88% {
    opacity: var(--op, 0.8);
  }
  100% {
    translate: 0 104%;
    opacity: 0;
  }
}
/* The sway, out to --drift and back. ease-in-out applies to EACH segment, so sideways speed hits
   zero exactly at the turn and the flake glides through it; on the linear fall it reversed at full
   speed and read as a bounce off invisible glass. */
@keyframes cardfx-snow-sway {
  0% {
    translate: 0;
  }
  50% {
    translate: var(--drift, 0);
  }
  100% {
    translate: 0;
  }
}
.card-fx-snow .g {
  width: 16px;
  height: 2px;
  margin-left: -8px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, #ffffff, transparent);
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.85);
  animation: cardfx-snow-settle var(--dur, 4.5s) ease-out var(--delay, 0s) infinite;
}
@keyframes cardfx-snow-settle {
  0%,
  86% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  94% {
    opacity: 0.3;
    transform: scaleX(1);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.4);
  }
}
`,
};
