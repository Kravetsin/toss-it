import type { CardEffectModule } from '../types';

/**
 * Mint dots drifting upward across the card, each rising out of a soft glow that blooms at its
 * origin on the bottom edge. The `.compact` variant (leaderboard rows, chat pills) flies a
 * trajectory that starts/ends OUTSIDE the row and drops the glows — a whole dot is only seen while
 * crossing, fast & smooth, confined to its row.
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
.card-fx-levitation .p {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-accent, #8df0cc);
  box-shadow: 0 0 6px var(--color-accent, #8df0cc);
  animation: cardfx-rise var(--dur, 3.4s) linear var(--delay, 0s) infinite;
}
@keyframes cardfx-rise {
  0% {
    top: 100%;
    opacity: 0;
    transform: translateX(0) scale(var(--s, 1));
  }
  14% {
    opacity: 0.8;
  }
  100% {
    top: -8%;
    opacity: 0;
    transform: translateX(var(--drift, 0)) scale(calc(var(--s, 1) * 0.35));
  }
}
.card-fx-levitation.compact .p {
  animation-name: cardfx-rise-compact;
}
@keyframes cardfx-rise-compact {
  0% {
    top: 135%;
    opacity: 0;
    transform: translateX(0) scale(var(--s, 1));
  }
  22% {
    opacity: 0.9;
  }
  78% {
    opacity: 0.9;
  }
  100% {
    top: -35%;
    opacity: 0;
    transform: translateX(var(--drift, 0)) scale(calc(var(--s, 1) * 0.5));
  }
}
.card-fx-levitation .g {
  width: 26px;
  height: 2px;
  margin-left: -13px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, var(--color-accent, #8df0cc), transparent);
  box-shadow: 0 0 6px var(--color-accent, #8df0cc);
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
