import { DEPTH_BLUR_RATIO_POINT, depthCount, depthPlane, parallaxDur } from '../depth';
import type { CardEffectModule } from '../types';

/**
 * Thin greyish rain falling straight down, each drop rippling where it lands on the bottom edge —
 * the deliberate "straight" mirror of the diagonal card-stardust meteors (no rotation/translateX,
 * only vertical fall + per-drop length). Fixed cool grey-blue color (not the accent) so it reads as
 * water regardless of nick/theme. The ripples drop on `.compact`.
 *
 * DEPTH (see ../depth): a drop is a STREAK, so the blur ratio hangs off its WIDTH, not its length —
 * a streak is a point smeared by motion, and defocus works on the cross-section, which is why it
 * takes the POINT ratio rather than the shaped one. Hanging it off the length instead would dissolve
 * a 30px near drop into fog. Nearer = wider, longer, much faster; only the in-focus plane ripples,
 * since a drop in front of the lens lands nowhere near this card.
 */
export const cardRain: CardEffectModule = {
  id: 'card-rain',
  type: 'card_effect',
  costDust: 4000,
  className: 'card-fx-rain',
  // In-focus density; depthCount adds the off-focus planes on top rather than out of it (../depth).
  counts: { web: depthCount(12), overlayCard: depthCount(16), overlayChat: depthCount(8) },
  labels: { name: 'shop.cardRain', desc: 'shop.cardRainDesc' },
  particle: (rnd, compact, index) => {
    const plane = depthPlane(index);
    // Width is the depth axis (the streak's cross-section); length rides along with it.
    const nearW = compact ? rnd(2.6, 3.4) : rnd(3.5, 4.5);
    const w = plane === 'near' ? nearW : plane === 'far' ? rnd(1, 1.2) : rnd(1.3, 1.7);
    const z = w / 1.5;
    // Rain is already the fastest thing here; a near drop is a blink. Jitter is gusts.
    const dur = parallaxDur(0.95, z, rnd(0.85, 1.15));
    return {
      left: `${rnd(0, 98).toFixed(1)}%`,
      height: `${(rnd(10, 18) * z).toFixed(0)}px`,
      '--w': `${w.toFixed(2)}px`,
      '--blur': `${(w * DEPTH_BLUR_RATIO_POINT[plane]).toFixed(2)}px`,
      '--op': plane === 'far' ? '0.65' : '0.9',
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Ripple at the drop's column (it falls straight, so impact x = spawn x), blooming as it lands.
  // In-focus plane only: a drop crossing in front of the lens never hit this card.
  groundGlow: (p) => ({
    ...(p['--blur'] === '0.00px' ? {} : { display: 'none' }),
    left: p.left ?? '50%',
    '--dur': p['--dur'] ?? '0.9s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
.card-fx-rain .p {
  width: var(--w, 1.5px);
  border-radius: 1px;
  background: linear-gradient(to bottom, transparent, #a9b8c9);
  /* Safe here: the fall is a translateY, so no scale multiplies this — it stays screen px. */
  filter: blur(var(--blur, 0));
  animation: cardfx-rain-fall var(--dur, 0.9s) linear var(--delay, 0s) infinite;
}
/* The drop ENTERS from above the card and LEAVES below it — it is never born or killed in frame.
   translateY is a % of the drop's OWN length, which is the only unit that knows how far a given drop
   has to sit to be fully hidden: -100% parks its tip exactly on the spawn line, so at 0% the whole
   streak is above the card no matter how long the near plane made it, and the layer's overflow clip
   does the reveal. It used to start at top:-10% (≈8px up) and fade in over the first 15% — by which
   point a 30px near drop was a third of the way down the card, so it did not fly in, it materialised.
   Opacity is now flat: with the drop parked outside at both ends there is nothing to hide. It stays
   IN the keyframes (rather than on .p) so animation-less reduced-motion still gets the base 0. */
@keyframes cardfx-rain-fall {
  0% {
    top: -10%;
    opacity: var(--op, 0.9);
    transform: translateY(-100%);
  }
  100% {
    top: 100%;
    opacity: var(--op, 0.9);
    transform: translateY(0);
  }
}
.card-fx-rain.compact .p {
  animation-name: cardfx-rain-compact;
}
@keyframes cardfx-rain-compact {
  0% {
    top: -60%;
    opacity: var(--op, 0.9);
    transform: translateY(-100%);
  }
  100% {
    top: 140%;
    opacity: var(--op, 0.9);
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
