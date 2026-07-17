import { DEPTH_BLUR_RATIO_SHAPED, depthCount, depthPlane, parallaxDur } from '../depth';
import type { CardEffectModule } from '../types';

/**
 * Sakura petals tumbling down and settling on the bottom edge. The closest sibling of card-snow
 * (a calm fall, sway returning to the spawn column so the petal and its glow line up), but a petal
 * is not a dot: it has a shape, it turns around its own axis, and it CATCHES THE LIGHT as it goes
 * edge-on. That last part is the whole effect — brightness synced to the rotation is what separates
 * petals from falling pink specks.
 *
 * Structure: `.p` is an invisible full-height COLUMN that falls, and `::before` is the petal that
 * tumbles and sways inside it. Splitting them means the motions live on different elements and
 * cannot collide over a shared property. It also gives the blur somewhere to live: `::before`
 * already animates `filter: brightness()`, and filter is one property — a blur declared there would
 * be dropped the moment the tumble keyframe runs. On the column it composes instead of competing.
 *
 * The SWAY is on the petal for the same reason, and it is not a detail. It used to ride the fall,
 * because `translate` sets both axes at once — but the fall must be `linear` (a petal that eased
 * downward would fall wrong), and a linear sway hits its extreme at full sideways speed and
 * reverses instantly. That is a bounce, not a glide: the petal looked like it was hitting invisible
 * glass twice a second. Vertical and horizontal are different motions with different easings, so
 * they get different elements — the column falls linearly, the petal sways ease-in-out.
 *
 * DEPTH (see ../depth for the shared rules): blur alone reads as a blurry picture, not as depth —
 * the cue is the whole bundle moving together, so a nearer petal is also bigger, faster and drifts
 * wider. Only the in-focus plane settles: it is the plane that IS the card surface.
 *
 * The fall is a `translate`, NOT `top` like the older effects: `top` is a layout property and the
 * browser snaps it to whole pixels, so in a 40px leaderboard row a ~5s fall covers ~45px — about 8
 * one-pixel jumps a second, i.e. visible 8fps stepping. The others hide this behind speed (rain
 * crosses the same row at ~114px/s, where 1px steps blend); a petal is meant to be slow, so it has
 * to be smooth instead. `translate` is composited, subpixel, and smooth at any speed — which is
 * also why this needs no `.compact` variant.
 *
 * Why the column, and not `cqh` on a plain particle: container units inside @keyframes are resolved
 * when the keyframes are computed, and a container merely RESIZING doesn't reliably recompute them
 * — an expanding dashboard card left petals falling only as far as its collapsed height. A `%`
 * translate resolves against the element's own box at used-value time, so a column that is
 * `height: 100%` of the layer re-measures on every layout, in every engine.
 */
export const cardSakura: CardEffectModule = {
  id: 'card-sakura',
  type: 'card_effect',
  costDust: 3500,
  className: 'card-fx-sakura',
  // Petals are far bigger than snowflakes — the same count would read as a blizzard, not a drift.
  // The numbers are the IN-FOCUS density; depthCount adds the off-focus planes on top (see ../depth).
  counts: { web: depthCount(10), overlayCard: depthCount(13), overlayChat: depthCount(6) },
  labels: { name: 'shop.cardSakura', desc: 'shop.cardSakuraDesc' },
  particle: (rnd, compact, index) => {
    const plane = depthPlane(index);

    // A 40px row can't host a 16px petal — blurred, it would be a pink wash over the whole row.
    const nearW = compact ? rnd(9, 12) : rnd(12, 16);
    const w = plane === 'near' ? nearW : plane === 'far' ? rnd(5, 7) : rnd(6, 10);
    const blur = w * DEPTH_BLUR_RATIO_SHAPED[plane];
    // Free to be properly lazy: the fall is a subpixel `translate`, so slowness costs no smoothness.
    // Speed follows SIZE, not the plane (see parallaxDur): a big petal that dawdled past a small one
    // broke the illusion from inside the in-focus plane, where sizes vary ~1.7×. Wind is the jitter
    // — the one place a petal may honestly disagree with its own depth.
    const dur = parallaxDur(5.7, w / 8, rnd(0.85, 1.15));
    // Against a DARK card, defocus must stay saturated. The instinct to fade it (haze, low contrast)
    // is borrowed from bright backgrounds; here blur already spreads a petal's light thin, and
    // fading on top of that turns it into a grey smudge — lens dirt, not bokeh. Both off-focus
    // planes keep their pink; distance is carried by size, speed and drift instead.
    const op = plane === 'near' ? 0.75 : plane === 'far' ? 0.7 : 0.92;
    const sat = plane === 'near' ? 1.35 : plane === 'far' ? 1.15 : 1;

    return {
      left: `${rnd(2, 98).toFixed(1)}%`,
      // Size goes to the ::before petal, not the .p column — the column must stay full-height.
      '--w': `${w.toFixed(1)}px`,
      '--h': `${(w * 0.72).toFixed(1)}px`,
      '--blur': `${blur.toFixed(2)}px`,
      '--sat': sat.toFixed(2),
      '--op': op.toFixed(2),
      '--drift': `${(rnd(-26, 26) * (plane === 'near' ? 1.6 : plane === 'far' ? 0.5 : 1)).toFixed(0)}px`,
      // Its own tumble axis per petal, so no two catch the light at the same moment.
      '--axis': `${rnd(0.25, 1).toFixed(2)} ${rnd(0.3, 1).toFixed(2)} ${rnd(0, 0.5).toFixed(2)}`,
      // Spin is deliberately NOT tied to --dur: a petal's turn has nothing to do with its fall.
      '--spin': `${rnd(1.5, 3.2).toFixed(2)}s`,
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Faint bloom where the petal settles (its sway returns to the spawn column at the end). Only the
  // in-focus plane gets one: a petal floating in front of the lens never touches the card to settle
  // ON, and reading --blur back is how that stays a fact of the module, not of the consumers.
  groundGlow: (p) => ({
    ...(p['--blur'] === '0.00px' ? {} : { display: 'none' }),
    left: p.left ?? '50%',
    '--dur': p['--dur'] ?? '4.6s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
/* The falling column: invisible, zero-width, exactly as tall as the layer — which is what makes a
   % translate below mean "% of the card" and re-measure whenever the card resizes. */
.card-fx-sakura .p {
  top: 0;
  width: 0;
  height: 100%;
  /* Defocus lives here, on the column, and not on the petal — see the header note about filter.
     Saturate rides along to pay back what the blur washes out. */
  filter: blur(var(--blur, 0)) saturate(var(--sat, 1));
  animation: cardfx-sakura-fall var(--dur, 5.7s) linear var(--delay, 0s) infinite;
}
/* The petal itself rides inside the column: it turns, and it sways. The sway is a SECOND animation
   rather than part of the fall — see the header. Same --dur/--delay as the fall, so it still returns
   to the spawn column exactly at landing and the settle glow stays under it. */
.card-fx-sakura .p::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: var(--w, 8px);
  height: var(--h, 5.8px);
  /* Two sharp corners + two round = a petal; a circle here would read as confetti. */
  border-radius: 100% 0 100% 0;
  background: linear-gradient(135deg, #ffe3ec 0%, #ffc2d8 45%, #f79ac0 100%);
  /* Bloom scales with the petal: a fixed radius made the big near-plane petals glow like small ones,
     which flattens the very depth the size was meant to sell. */
  box-shadow: 0 0 calc(var(--w, 8px) * 0.4) rgba(255, 170, 205, 0.45);
  animation:
    cardfx-sakura-tumble var(--spin, 2.2s) linear var(--delay, 0s) infinite,
    cardfx-sakura-sway var(--dur, 5.7s) ease-in-out var(--delay, 0s) infinite;
}
/* Pure vertical: -8% → 104% of the column (= of the card), linear, no midpoint stop needed.
   The petal ENTERS from above the edge. -8% alone only lifted the column 8% of the card, so a
   near-plane petal hung into frame and then FADED IN there — it did not glide in, it appeared. The
   extra --h is the petal's own height, the one distance that clears it on any card at any plane;
   the layer's overflow clip does the reveal. It still fades out at the bottom — that fade IS the
   settling, and the glow blooms into it. Opacity stays in the keyframes so animation-less
   reduced-motion still falls back to the base 0. */
@keyframes cardfx-sakura-fall {
  0% {
    translate: 0 calc(-8% - var(--h, 6px));
    opacity: var(--op, 0.92);
  }
  88% {
    opacity: var(--op, 0.92);
  }
  100% {
    translate: 0 104%;
    opacity: 0;
  }
}
/* The sway, out to --drift and back. ease-in-out is the entire point: it applies to EACH segment, so
   sideways speed reaches zero exactly at the turn and the petal glides through it. Linear (which the
   fall must be) made X reverse at full speed mid-air — the petal read as bouncing off glass. */
@keyframes cardfx-sakura-sway {
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
@keyframes cardfx-sakura-tumble {
  0% {
    rotate: var(--axis, 1 1 0) 0deg;
    filter: brightness(1);
  }
  25% {
    /* Edge-on: the petal is foreshortened to a sliver and flares. */
    filter: brightness(1.4);
  }
  50% {
    rotate: var(--axis, 1 1 0) 180deg;
    filter: brightness(0.8);
  }
  75% {
    filter: brightness(1.4);
  }
  100% {
    rotate: var(--axis, 1 1 0) 360deg;
    filter: brightness(1);
  }
}
.card-fx-sakura .g {
  width: 18px;
  height: 2px;
  margin-left: -9px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, #ffc2d8, transparent);
  box-shadow: 0 0 4px rgba(255, 154, 192, 0.6);
  animation: cardfx-sakura-settle var(--dur, 4.6s) ease-out var(--delay, 0s) infinite;
}
@keyframes cardfx-sakura-settle {
  0%,
  86% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  94% {
    opacity: 0.35;
    transform: scaleX(1);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.4);
  }
}
`,
};
