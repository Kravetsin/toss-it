import type { CardEffectModule } from '../types';

/**
 * Soft white flakes falling slowly down the whole card onto a static, lumpy snowdrift at the
 * bottom — reads as calm "snow", distinct from levitation's fast upward rise. Fixed white color
 * (not the accent) so it reads as snow regardless of nick/theme. Unlike the levitation/rain pools
 * the drift does NOT wave — it's settled snow. The `.compact` variant (leaderboard rows, chat
 * pills) flies a trajectory that starts/ends OUTSIDE the row and drops the drift.
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
/* Thin settled snowdrift at the very bottom: a solid base line (::before) plus a few big rounded
   mounds (::after) — static, since it's accumulated snow, not liquid. Hidden on .compact. */
.card-fx-snow::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.6);
}
.card-fx-snow::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 8px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='8' viewBox='0 0 150 8'%3E%3Cpath d='M0 8 V6 Q37.5 1 75 6 Q112.5 1 150 6 V8 Z' fill='%23ffffff'/%3E%3C/svg%3E")
    repeat-x;
  background-size: 150px 8px;
  opacity: 0.75;
}
.card-fx-snow.compact::before,
.card-fx-snow.compact::after {
  display: none;
}
`,
};
