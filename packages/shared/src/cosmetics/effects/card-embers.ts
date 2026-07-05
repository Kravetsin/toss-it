import type { CardEffectModule } from '../types';

/**
 * Campfire crackle: fast, chaotic sparks that shoot up, veer sideways and shrink to nothing as they
 * "burn out" mid-flight — deliberately unlike levitation's slow, steady mint rise. Fixed fiery color
 * (not the accent) so the effect reads as fire regardless of nick/theme. The `.compact` variant
 * starts/ends OUTSIDE the row so a whole spark is only seen while crossing it.
 */
export const cardEmbers: CardEffectModule = {
  id: 'card-embers',
  type: 'card_effect',
  costDust: 3000,
  className: 'card-fx-embers',
  counts: { web: 12, overlayCard: 16, overlayChat: 8 },
  labels: { name: 'shop.cardEmbers', desc: 'shop.cardEmbersDesc' },
  particle: (rnd) => {
    // Short, varied lifetimes + a wide drift range make the swarm read as erratic sparks.
    const dur = rnd(0.7, 1.6);
    return {
      left: `${rnd(4, 96).toFixed(1)}%`,
      '--drift': `${rnd(-45, 45).toFixed(0)}px`,
      '--s': rnd(0.6, 1.25).toFixed(2),
      animationDuration: `${dur.toFixed(2)}s`,
      animationDelay: `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  css: `
.card-fx-embers .p {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #ffb43a;
  box-shadow: 0 0 5px #ff6a1a, 0 0 10px #ff2d00;
  animation: cardfx-embers-burn 1.2s ease-out infinite;
}
@keyframes cardfx-embers-burn {
  0% { top: 100%; opacity: 0; transform: translateX(0) scale(var(--s, 1)); }
  6% { opacity: 1; }
  30% { opacity: 1; }
  60% {
    opacity: 0.7;
    transform: translateX(calc(var(--drift, 0) * 0.5)) scale(calc(var(--s, 1) * 0.5));
  }
  100% { top: -5%; opacity: 0; transform: translateX(var(--drift, 0)) scale(0.05); }
}
.card-fx-embers.compact .p {
  animation-name: cardfx-embers-burn-compact;
}
@keyframes cardfx-embers-burn-compact {
  0% { top: 135%; opacity: 0; transform: translateX(0) scale(var(--s, 1)); }
  15% { opacity: 1; }
  70% {
    opacity: 0.7;
    transform: translateX(calc(var(--drift, 0) * 0.6)) scale(calc(var(--s, 1) * 0.5));
  }
  100% { top: -35%; opacity: 0; transform: translateX(var(--drift, 0)) scale(0.08); }
}
`,
};
