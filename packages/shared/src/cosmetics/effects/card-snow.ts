import type { CardEffectModule } from '../types';

/**
 * Soft white flakes falling slowly down the whole card while swaying sideways — reads as calm
 * "snow", distinct from levitation's fast upward rise. Fixed white color (not the accent) so it
 * reads as snow regardless of nick/theme. The `.compact` variant (leaderboard rows, chat pills)
 * flies a trajectory that starts/ends OUTSIDE the row so a whole flake is only seen while crossing.
 */
export const cardSnow: CardEffectModule = {
  id: 'card-snow',
  type: 'card_effect',
  costDust: 3000,
  className: 'card-fx-snow',
  counts: { web: 12, overlayCard: 16, overlayChat: 8 },
  labels: { name: 'shop.cardSnow', desc: 'shop.cardSnowDesc' },
  particle: (rnd) => {
    const dur = rnd(4, 8);
    return {
      left: `${rnd(2, 98).toFixed(1)}%`,
      '--drift': `${rnd(-30, 30).toFixed(0)}px`,
      '--s': rnd(0.5, 1.4).toFixed(2),
      animationDuration: `${dur.toFixed(2)}s`,
      animationDelay: `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  css: `
.card-fx-snow .p {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.75);
  /* duration + delay are randomized inline per particle (see particle()). */
  animation: cardfx-snow-fall 6s linear infinite;
}
@keyframes cardfx-snow-fall {
  0% {
    top: -10%;
    opacity: 0;
    transform: translateX(0) scale(var(--s, 1));
  }
  12% {
    opacity: 0.75;
  }
  50% {
    transform: translateX(var(--drift, 0)) scale(var(--s, 1));
  }
  88% {
    opacity: 0.75;
  }
  100% {
    top: 110%;
    opacity: 0;
    transform: translateX(0) scale(var(--s, 1));
  }
}
.card-fx-snow.compact .p {
  animation-name: cardfx-snow-compact;
}
@keyframes cardfx-snow-compact {
  0% {
    top: -35%;
    opacity: 0;
    transform: translateX(0) scale(var(--s, 1));
  }
  20% {
    opacity: 0.85;
  }
  80% {
    opacity: 0.85;
  }
  100% {
    top: 135%;
    opacity: 0;
    transform: translateX(var(--drift, 0)) scale(var(--s, 1));
  }
}
`,
};
