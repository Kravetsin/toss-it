import type { CardEffectModule } from '../types';

/**
 * Mint dots drifting upward across the whole card. The `.compact` variant (leaderboard rows, chat
 * pills) flies a trajectory that starts/ends OUTSIDE the row so a whole dot is only seen while
 * crossing — fast & smooth, confined to its row.
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
      animationDuration: `${dur.toFixed(2)}s`,
      animationDelay: `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  css: `
.card-fx-levitation .p {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--color-accent, #8df0cc);
  box-shadow: 0 0 6px var(--color-accent, #8df0cc);
  /* duration + delay are randomized inline per particle (see particle()). */
  animation: cardfx-rise 3.4s linear infinite;
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
`,
};
