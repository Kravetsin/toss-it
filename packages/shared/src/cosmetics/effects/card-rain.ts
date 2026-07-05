import type { CardEffectModule } from '../types';

/**
 * Thin greyish rain falling straight down into a shallow puddle at the bottom — the deliberate
 * "straight" mirror of the diagonal card-stardust meteors, so no rotation/translateX here, only
 * vertical fall and per-drop length. Same liquid-pool idea as levitation, in a cool grey-blue (not
 * the accent) so it reads as water regardless of nick/theme. The pool drops on `.compact`.
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
/* Thin animated puddle border the rain falls into: a solid base line (::before) plus a few big
   waves (::after) scrolling sideways — reads like a slightly thick wavy border, not a deep pool.
   Hidden on .compact. */
.card-fx-rain::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: rgba(169, 184, 201, 0.55);
}
.card-fx-rain::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 7px;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='130' height='7' viewBox='0 0 130 7'%3E%3Cpath d='M0 3 Q32.5 0 65 3 T130 3 V7 H0 Z' fill='%23a9b8c9'/%3E%3C/svg%3E")
    repeat-x;
  background-size: 130px 7px;
  opacity: 0.7;
  animation: cardfx-rain-wave 3s linear infinite;
}
@keyframes cardfx-rain-wave {
  to {
    background-position-x: -130px;
  }
}
.card-fx-rain.compact::before,
.card-fx-rain.compact::after {
  display: none;
}
`,
};
