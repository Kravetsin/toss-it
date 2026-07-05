import type { CardEffectModule } from '../types';

/**
 * Soft white flakes falling down the card, each leaving a faint line of light where it settles on
 * the bottom edge — reads as calm "snow", distinct from levitation's fast upward rise. Fixed white
 * color (not the accent). Falls via `top` at a moderate speed (like levitation) so it reaches the
 * bottom for the settle glow while staying smooth; the sideways sway returns to the spawn column at
 * the end so the flake and its glow line up. Glows are dropped on `.compact`.
 */
export const cardSnow: CardEffectModule = {
  id: 'card-snow',
  type: 'card_effect',
  costDust: 3000,
  className: 'card-fx-snow',
  counts: { web: 12, overlayCard: 16, overlayChat: 8 },
  labels: { name: 'shop.cardSnow', desc: 'shop.cardSnowDesc' },
  particle: (rnd) => {
    // Moderate speed (not the old 5-9s): fast enough that top-based falling stays smooth.
    const dur = rnd(3.5, 5.5);
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
.card-fx-snow .p {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.75);
  animation: cardfx-snow-fall var(--dur, 4.5s) linear var(--delay, 0s) infinite;
}
@keyframes cardfx-snow-fall {
  0% {
    top: -8%;
    opacity: 0;
    transform: translateX(0) scale(var(--s, 1));
  }
  12% {
    opacity: 0.8;
  }
  50% {
    transform: translateX(var(--drift, 0)) scale(var(--s, 1));
  }
  88% {
    opacity: 0.8;
  }
  100% {
    top: 104%;
    opacity: 0;
    transform: translateX(0) scale(var(--s, 1));
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
