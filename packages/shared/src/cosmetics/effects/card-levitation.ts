import type { CardEffectModule } from '../types';

/**
 * Mint dots drifting upward across the card, each rising out of a soft glow that blooms at its
 * origin on the bottom edge. The `.compact` variant (leaderboard rows, chat pills) flies a
 * trajectory that starts/ends OUTSIDE the row — a whole dot is only seen while crossing, confined
 * to its row.
 *
 * Structure (same as snow/sakura): `.p` is an invisible full-height COLUMN that carries the rise,
 * `::before` is the dot. The rise is a `%` translate, NOT `top`: `top` is a layout property snapped
 * to whole pixels, and at ~16px/s in a leaderboard row that reads as ~16 one-pixel jumps a second —
 * next to the smooth effects it looks like lag. A column that is `height: 100%` of the layer makes
 * `translate: 0 X%` mean exactly what `top: X%` used to, but composited and subpixel — and it
 * re-measures on every layout, so an expanding card is handled for free (container units are not:
 * they don't reliably recompute on a resize).
 *
 * The dot also shrinks as it climbs, and that CANNOT ride on the column — scaling it would scale
 * its height and break the percentages. It lives on `::before` as its own animation, sharing
 * --dur/--delay so the two stay in step.
 */
export const cardLevitation: CardEffectModule = {
  id: 'card-levitation',
  type: 'card_effect',
  costDust: 2500,
  className: 'card-fx-levitation',
  counts: { web: 10, overlayCard: 14, overlayChat: 8 },
  labels: { name: 'shop.cardLevitation', desc: 'shop.cardLevitationDesc' },
  particle: (rnd) => {
    const dur = rnd(2.8, 4.6);
    return {
      left: `${rnd(2, 98).toFixed(1)}%`,
      '--drift': `${rnd(-18, 18).toFixed(0)}px`,
      '--s': rnd(0.65, 1.35).toFixed(2),
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Glow sits at the dot's spawn column and blooms as the dot emerges from the bottom.
  groundGlow: (p) => ({
    left: p.left ?? '50%',
    '--dur': p['--dur'] ?? '3.4s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
/* The rising column: invisible, zero-width, exactly as tall as the layer — which is what makes a
   % translate below mean "% of the card" and re-measure whenever the card resizes. */
.card-fx-levitation .p {
  top: 0;
  width: 0;
  height: 100%;
  animation: cardfx-rise var(--dur, 3.4s) linear var(--delay, 0s) infinite;
}
/* The dot itself rides inside the column; its shrink shares --dur/--delay to stay in step. */
.card-fx-levitation .p::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--cos-mint, #8df0cc);
  box-shadow: 0 0 6px var(--cos-mint, #8df0cc);
  animation: cardfx-rise-shrink var(--dur, 3.4s) linear var(--delay, 0s) infinite;
}
@keyframes cardfx-rise {
  0% {
    translate: 0 100%;
    opacity: 0;
  }
  14% {
    opacity: 0.8;
  }
  100% {
    translate: var(--drift, 0) -8%;
    opacity: 0;
  }
}
@keyframes cardfx-rise-shrink {
  0% {
    scale: var(--s, 1);
  }
  100% {
    scale: calc(var(--s, 1) * 0.35);
  }
}
.card-fx-levitation.compact .p {
  animation-name: cardfx-rise-compact;
}
.card-fx-levitation.compact .p::before {
  animation-name: cardfx-rise-shrink-compact;
}
@keyframes cardfx-rise-compact {
  0% {
    translate: 0 135%;
    opacity: 0;
  }
  22% {
    opacity: 0.9;
  }
  78% {
    opacity: 0.9;
  }
  100% {
    translate: var(--drift, 0) -35%;
    opacity: 0;
  }
}
@keyframes cardfx-rise-shrink-compact {
  0% {
    scale: var(--s, 1);
  }
  100% {
    scale: calc(var(--s, 1) * 0.5);
  }
}
.card-fx-levitation .g {
  width: 26px;
  height: 2px;
  margin-left: -13px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, var(--cos-mint, #8df0cc), transparent);
  box-shadow: 0 0 6px var(--cos-mint, #8df0cc);
  animation: cardfx-levitation-glow var(--dur, 3.4s) ease-out var(--delay, 0s) infinite;
}
@keyframes cardfx-levitation-glow {
  0% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  8% {
    opacity: 0.5;
    transform: scaleX(1);
  }
  34% {
    opacity: 0;
    transform: scaleX(1.25);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.25);
  }
}
/* Compact rows: the dot enters from below at 20.6% of the timeline ((135-100)/170), not at 0%. */
.card-fx-levitation.compact .g {
  animation-name: cardfx-levitation-glow-compact;
}
@keyframes cardfx-levitation-glow-compact {
  0%,
  15% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  22% {
    opacity: 0.5;
    transform: scaleX(1);
  }
  46% {
    opacity: 0;
    transform: scaleX(1.25);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.25);
  }
}
`,
};
