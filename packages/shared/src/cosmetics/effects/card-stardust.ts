import type { CardEffectModule } from '../types';

/**
 * Mint meteors raining diagonally across the card. All meteors share one fixed direction; the bar
 * is rotated to point along it (-24deg matches the translate vector) so each star flies the way it
 * points — only spawn/speed/phase are random. The `.compact` variant falls straight for short rows.
 */
export const cardStardust: CardEffectModule = {
  id: 'card-stardust',
  type: 'card_effect',
  costDust: 3500,
  className: 'card-fx-stardust',
  counts: { web: 7, overlayCard: 10, overlayChat: 6 },
  labels: { name: 'shop.cardStardust', desc: 'shop.cardStardustDesc' },
  particle: (rnd) => {
    const dur = rnd(1.8, 3.0);
    return {
      left: `${rnd(-10, 92).toFixed(1)}%`,
      top: `${rnd(-25, 35).toFixed(1)}%`,
      height: `${rnd(16, 28).toFixed(0)}px`,
      animationDuration: `${dur.toFixed(2)}s`,
      animationDelay: `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  css: `
.card-fx-stardust .p {
  width: 2px;
  height: 20px;
  border-radius: 2px;
  background: linear-gradient(to bottom, transparent, var(--color-accent, #8df0cc));
  filter: drop-shadow(0 0 3px var(--color-accent, #8df0cc));
  animation: cardfx-fall 2.6s linear infinite;
}
@keyframes cardfx-fall {
  0% {
    opacity: 0;
    transform: translate(0, 0) rotate(-24deg);
  }
  15% {
    opacity: 0.9;
  }
  85% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(120px, 270px) rotate(-24deg);
  }
}
.card-fx-stardust.compact .p {
  animation-name: cardfx-fall-compact;
}
@keyframes cardfx-fall-compact {
  0% {
    top: -75%;
    opacity: 0;
    transform: translateX(0) rotate(-24deg);
  }
  22% {
    opacity: 0.9;
  }
  78% {
    opacity: 0.9;
  }
  100% {
    top: 140%;
    opacity: 0;
    transform: translateX(40px) rotate(-24deg);
  }
}
`,
};
