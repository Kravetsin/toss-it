import type { CardEffectModule } from '../types';

/**
 * Mint dots drifting upward across the whole card, out of a shallow liquid pool at the bottom (a
 * CSS-only nod to the viewer-page vessel). The `.compact` variant (leaderboard rows, chat pills)
 * flies a trajectory that starts/ends OUTSIDE the row and drops the pool — a whole dot is only seen
 * while crossing, fast & smooth, confined to its row.
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
/* Thin animated liquid border at the very bottom the dots rise from: a solid base line (::before)
   plus a few big waves (::after) scrolling sideways — reads like a slightly thick wavy border, not
   a deep pool. Hidden on .compact. */
.card-fx-levitation::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgba(141, 240, 204, 0.55);
}
.card-fx-levitation::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 7px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='130' height='7' viewBox='0 0 130 7'%3E%3Cpath d='M0 3 Q32.5 0 65 3 T130 3 V7 H0 Z' fill='%238df0cc'/%3E%3C/svg%3E")
    repeat-x;
  background-size: 130px 7px;
  opacity: 0.7;
  animation: cardfx-levitation-wave 3s linear infinite;
}
@keyframes cardfx-levitation-wave {
  to {
    background-position-x: -130px;
  }
}
.card-fx-levitation.compact::before,
.card-fx-levitation.compact::after {
  display: none;
}
`,
};
