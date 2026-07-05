import type { CardEffectModule } from '../types';

/**
 * Thin greyish rain falling straight down, each drop rippling where it lands on the bottom edge —
 * the deliberate "straight" mirror of the diagonal card-stardust meteors (no rotation/translateX,
 * only vertical fall + per-drop length). Fixed cool grey-blue color (not the accent) so it reads as
 * water regardless of nick/theme. The ripples drop on `.compact`.
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
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Ripple at the drop's column (it falls straight, so impact x = spawn x), blooming as it lands.
  groundGlow: (p) => ({
    left: p.left ?? '50%',
    '--dur': p['--dur'] ?? '0.9s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
.card-fx-rain .p {
  width: 1.5px;
  border-radius: 1px;
  background: linear-gradient(to bottom, transparent, #a9b8c9);
  animation: cardfx-rain-fall var(--dur, 0.9s) linear var(--delay, 0s) infinite;
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
.card-fx-rain .g {
  width: 18px;
  height: 2px;
  margin-left: -9px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, #c3ccd6, transparent);
  box-shadow: 0 0 4px #a9b8c9;
  animation: cardfx-rain-splash var(--dur, 0.9s) ease-out var(--delay, 0s) infinite;
}
@keyframes cardfx-rain-splash {
  0%,
  84% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  92% {
    opacity: 0.4;
    transform: scaleX(1);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.5);
  }
}
/* Compact rows: the drop crosses the row bottom at 80% of the timeline ((100+60)/200), not ~100%. */
.card-fx-rain.compact .g {
  animation-name: cardfx-rain-splash-compact;
}
@keyframes cardfx-rain-splash-compact {
  0%,
  72% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  81% {
    opacity: 0.4;
    transform: scaleX(1);
  }
  90% {
    opacity: 0;
    transform: scaleX(1.5);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.5);
  }
}
`,
};
