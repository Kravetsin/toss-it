import type { CardEffectModule } from '../types';

/**
 * Soft white flakes falling down the card, each leaving a faint line of light where it settles on
 * the bottom edge — reads as calm "snow", distinct from levitation's fast upward rise. Fixed white
 * color (not the accent). The sideways sway returns to the spawn column at the end so the flake and
 * its glow line up.
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
  counts: { web: 12, overlayCard: 16, overlayChat: 8 },
  labels: { name: 'shop.cardSnow', desc: 'shop.cardSnowDesc' },
  particle: (rnd) => {
    // Free to be calm again: a composited translate costs no smoothness at low speed.
    const dur = rnd(4.5, 7);
    return {
      left: `${rnd(2, 98).toFixed(1)}%`,
      '--drift': `${rnd(-22, 22).toFixed(0)}px`,
      '--s': rnd(0.5, 1.4).toFixed(2),
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Faint line at the flake's column, blooming as it settles at the bottom (drift returns to 0 there).
  groundGlow: (p) => ({
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
  animation: cardfx-snow-fall var(--dur, 5.5s) linear var(--delay, 0s) infinite;
}
/* The flake itself rides inside the column; --s is its per-flake size. */
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
}
/* Y runs -8% → 104% of the column (= of the card) linearly, so the 50% stop carries its own
   midpoint (48%) — a translate keyframe sets both axes at once. */
@keyframes cardfx-snow-fall {
  0% {
    translate: 0 -8%;
    opacity: 0;
  }
  12% {
    opacity: 0.8;
  }
  50% {
    translate: var(--drift, 0) 48%;
  }
  88% {
    opacity: 0.8;
  }
  100% {
    translate: 0 104%;
    opacity: 0;
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
