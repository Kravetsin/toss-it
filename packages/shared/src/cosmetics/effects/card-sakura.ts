import type { CardEffectModule } from '../types';

/**
 * Sakura petals tumbling down and settling on the bottom edge. The closest sibling of card-snow
 * (a calm fall, sway returning to the spawn column so the petal and its glow line up), but a petal
 * is not a dot: it has a shape, it turns around its own axis, and it CATCHES THE LIGHT as it goes
 * edge-on. That last part is the whole effect — brightness synced to the rotation is what separates
 * petals from falling pink specks.
 *
 * Structure: `.p` is an invisible full-height COLUMN that falls, and `::before` is the petal that
 * tumbles inside it. Splitting them means the two motions live on different elements and cannot
 * collide over a shared property.
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
  counts: { web: 9, overlayCard: 12, overlayChat: 6 },
  labels: { name: 'shop.cardSakura', desc: 'shop.cardSakuraDesc' },
  particle: (rnd) => {
    // Free to be properly lazy: the fall is a subpixel `translate`, so slowness costs no smoothness.
    const dur = rnd(4.5, 7);
    const w = rnd(6, 10);
    return {
      left: `${rnd(2, 98).toFixed(1)}%`,
      // Size goes to the ::before petal, not the .p column — the column must stay full-height.
      '--w': `${w.toFixed(1)}px`,
      '--h': `${(w * 0.72).toFixed(1)}px`,
      '--drift': `${rnd(-26, 26).toFixed(0)}px`,
      // Its own tumble axis per petal, so no two catch the light at the same moment.
      '--axis': `${rnd(0.25, 1).toFixed(2)} ${rnd(0.3, 1).toFixed(2)} ${rnd(0, 0.5).toFixed(2)}`,
      // Spin is deliberately NOT tied to --dur: a petal's turn has nothing to do with its fall.
      '--spin': `${rnd(1.5, 3.2).toFixed(2)}s`,
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Faint bloom where the petal settles (its sway returns to the spawn column at the end).
  groundGlow: (p) => ({
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
  animation: cardfx-sakura-fall var(--dur, 5.7s) linear var(--delay, 0s) infinite;
}
/* The petal itself rides inside the column and does the turning. */
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
  box-shadow: 0 0 3px rgba(255, 170, 205, 0.45);
  animation: cardfx-sakura-tumble var(--spin, 2.2s) linear var(--delay, 0s) infinite;
}
/* Y runs -8% → 104% of the column (= of the card) linearly, so the 50% stop must carry its own
   midpoint (48%) — a translate keyframe sets both axes at once. Sway returns to 0 at the end so the
   petal lands in its spawn column, under the settle glow. */
@keyframes cardfx-sakura-fall {
  0% {
    translate: 0 -8%;
    opacity: 0;
  }
  12% {
    opacity: 0.92;
  }
  50% {
    translate: var(--drift, 0) 48%;
  }
  88% {
    opacity: 0.92;
  }
  100% {
    translate: 0 104%;
    opacity: 0;
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
