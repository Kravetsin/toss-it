import type { CardEffectModule } from '../types';

/**
 * Thin greyish rain falling straight down — the deliberate "straight" mirror of the diagonal
 * card-stardust meteors, so no rotation/translateX here, only vertical fall and per-drop length.
 * Fixed cool grey-blue color (not the accent) so it reads as water regardless of nick/theme.
 */
export const cardRain: CardEffectModule = {
  id: 'card-rain',
  type: 'card_effect',
  costDust: 4000,
  className: 'card-fx-rain',
  counts: { web: 12, overlayCard: 16, overlayChat: 8 },
  labels: { name: 'shop.cardRain', desc: 'shop.cardRainDesc' },
  particle: (rnd) => {
    const dur = rnd(0.6, 1.3);
    return {
      left: `${rnd(0, 98).toFixed(1)}%`,
      height: `${rnd(10, 18).toFixed(0)}px`,
      animationDuration: `${dur.toFixed(2)}s`,
      animationDelay: `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  css: `
.card-fx-rain .p {
  width: 1.5px;
  border-radius: 1px;
  background: linear-gradient(to bottom, transparent, #a9b8c9);
  animation: cardfx-rain-fall 0.9s linear infinite;
}
@keyframes cardfx-rain-fall {
  0% {
    top: -10%;
    opacity: 0;
    transform: translateY(0);
  }
  15% {
    opacity: 0.9;
  }
  85% {
    opacity: 0.9;
  }
  100% {
    top: 100%;
    opacity: 0;
    transform: translateY(110%);
  }
}
.card-fx-rain.compact .p {
  animation-name: cardfx-rain-compact;
}
@keyframes cardfx-rain-compact {
  0% {
    top: -60%;
    opacity: 0;
    transform: translateY(0);
  }
  20% {
    opacity: 0.9;
  }
  80% {
    opacity: 0.9;
  }
  100% {
    top: 140%;
    opacity: 0;
    transform: translateY(0);
  }
}
`,
};
