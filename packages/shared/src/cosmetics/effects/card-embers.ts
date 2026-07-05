import type { CardEffectModule } from '../types';

/**
 * Campfire crackle: fast, chaotic sparks that shoot up, veer sideways and shrink to nothing as they
 * "burn out" mid-flight, each igniting from a hot glow on the bottom edge — deliberately unlike
 * levitation's slow, steady mint rise. Fixed fiery color (not the accent). The `.compact` variant
 * starts/ends OUTSIDE the row and drops the glows so a whole spark is only seen while crossing it.
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
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // A hot ember glow at each spark's origin column, flaring as the spark ignites off the bottom.
  groundGlow: (p) => ({
    left: p.left ?? '50%',
    '--dur': p['--dur'] ?? '1.2s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
.card-fx-embers .p {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #ffb43a;
  box-shadow: 0 0 5px #ff6a1a, 0 0 10px #ff2d00;
  animation: cardfx-embers-burn var(--dur, 1.2s) ease-out var(--delay, 0s) infinite;
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
.card-fx-embers .g {
  width: 22px;
  height: 2px;
  margin-left: -11px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, #ff8a2b, transparent);
  box-shadow: 0 0 7px #ff3d00;
  animation: cardfx-embers-glow var(--dur, 1.2s) ease-out var(--delay, 0s) infinite;
}
@keyframes cardfx-embers-glow {
  0% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  10% {
    opacity: 0.75;
    transform: scaleX(1);
  }
  45% {
    opacity: 0.2;
    transform: scaleX(1.2);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.25);
  }
}
/* Compact rows: sparks enter from below at ~12% of the timeline (ease-out front-loads the rise). */
.card-fx-embers.compact .g {
  animation-name: cardfx-embers-glow-compact;
}
@keyframes cardfx-embers-glow-compact {
  0%,
  6% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  14% {
    opacity: 0.75;
    transform: scaleX(1);
  }
  46% {
    opacity: 0.2;
    transform: scaleX(1.2);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.25);
  }
}
`,
};
