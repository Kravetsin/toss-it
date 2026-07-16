import { DEPTH_BLUR_RATIO_POINT, depthCount, depthPlane, parallaxDur } from '../depth';
import type { CardEffectModule } from '../types';

/**
 * Campfire crackle: fast, chaotic sparks that shoot up, veer sideways and shrink to nothing as they
 * "burn out" mid-flight, each igniting from a hot glow on the bottom edge — deliberately unlike
 * levitation's slow, steady mint rise. Fixed fiery color (not the accent). The `.compact` variant
 * starts/ends OUTSIDE the row and drops the glows so a whole spark is only seen while crossing it.
 *
 * DEPTH (see ../depth): a spark is a point of light, so it takes the POINT blur ratio — nearer =
 * bigger, faster, wider veer. Chaos is this effect's whole character, so the parallax jitter is the
 * widest in the catalog: a spark is ALLOWED to disagree with its own depth (updraughts do that),
 * where a snowflake is not.
 *
 * The burn-out shrink had to move off `.p` onto `::before` to make room for the blur. A filter is
 * applied in the element's own coordinate space and only THEN scaled by that element's transform —
 * so blur sharing an element with the shrink would have been multiplied by --s on ignition and then
 * melted away to nothing as the spark burned down to scale 0.05, i.e. every near spark would come
 * into focus exactly as it died. Splitting them is the same column/::before division snow, sakura
 * and levitation already use: position on one element, size on the other.
 */
export const cardEmbers: CardEffectModule = {
  id: 'card-embers',
  type: 'card_effect',
  costDust: 3000,
  className: 'card-fx-embers',
  // In-focus density; depthCount adds the off-focus planes on top rather than out of it (../depth).
  counts: { web: depthCount(12), overlayCard: depthCount(16), overlayChat: depthCount(8) },
  labels: { name: 'shop.cardEmbers', desc: 'shop.cardEmbersDesc' },
  particle: (rnd, compact, index) => {
    const plane = depthPlane(index);
    // A 3px spark × --s. Near stays modest in a 40px row; the blur carries the defocus instead.
    const nearS = compact ? rnd(1.4, 1.9) : rnd(1.7, 2.4);
    const s = plane === 'near' ? nearS : plane === 'far' ? rnd(0.3, 0.5) : rnd(0.6, 1.25);
    // Short, varied lifetimes + a wide drift range make the swarm read as erratic sparks. Speed
    // still follows SIZE (see parallaxDur), just loosely — the jitter is the updraught.
    const dur = parallaxDur(1.05, s, rnd(0.8, 1.2));
    return {
      left: `${rnd(4, 96).toFixed(1)}%`,
      '--drift': `${(rnd(-45, 45) * (plane === 'near' ? 1.5 : plane === 'far' ? 0.55 : 1)).toFixed(0)}px`,
      '--s': s.toFixed(2),
      // Blur tracks the spark's RENDERED size (3px × --s) — one lens across all three planes.
      '--blur': `${(3 * s * DEPTH_BLUR_RATIO_POINT[plane]).toFixed(2)}px`,
      // Distance dims only the far plane: a blurred ember that is ALSO faded stops reading as fire.
      '--op': plane === 'far' ? '0.75' : '1',
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // A hot ember glow at each spark's origin column, flaring as the spark ignites off the bottom.
  // In-focus plane only: a spark drifting in front of the lens was never lit on this card.
  groundGlow: (p) => ({
    ...(p['--blur'] === '0.00px' ? {} : { display: 'none' }),
    left: p.left ?? '50%',
    '--dur': p['--dur'] ?? '1.2s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
/* The spark's FLIGHT: where it is, never how big it is. Keeping scale off this element is what lets
   the blur below be screen px instead of something the burn-out melts away (see the header). */
.card-fx-embers .p {
  width: 3px;
  height: 3px;
  filter: blur(var(--blur, 0));
  animation: cardfx-embers-burn var(--dur, 1.2s) ease-out var(--delay, 0s) infinite;
}
/* The spark itself: the ember, and its burn-out. Shares --dur/--delay with the flight, and its
   keyframe stops mirror it, so the two stay in step. */
.card-fx-embers .p::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: #ffb43a;
  box-shadow: 0 0 5px #ff6a1a, 0 0 10px #ff2d00;
  animation: cardfx-embers-burnout var(--dur, 1.2s) ease-out var(--delay, 0s) infinite;
}
@keyframes cardfx-embers-burn {
  0% { top: 100%; opacity: 0; transform: translateX(0); }
  6% { opacity: var(--op, 1); }
  30% { opacity: var(--op, 1); }
  60% {
    opacity: calc(var(--op, 1) * 0.7);
    transform: translateX(calc(var(--drift, 0) * 0.5));
  }
  100% { top: -5%; opacity: 0; transform: translateX(var(--drift, 0)); }
}
@keyframes cardfx-embers-burnout {
  0% { scale: var(--s, 1); }
  60% { scale: calc(var(--s, 1) * 0.5); }
  100% { scale: 0.05; }
}
.card-fx-embers.compact .p {
  animation-name: cardfx-embers-burn-compact;
}
.card-fx-embers.compact .p::before {
  animation-name: cardfx-embers-burnout-compact;
}
@keyframes cardfx-embers-burn-compact {
  0% { top: 135%; opacity: 0; transform: translateX(0); }
  15% { opacity: var(--op, 1); }
  70% {
    opacity: calc(var(--op, 1) * 0.7);
    transform: translateX(calc(var(--drift, 0) * 0.6));
  }
  100% { top: -35%; opacity: 0; transform: translateX(var(--drift, 0)); }
}
@keyframes cardfx-embers-burnout-compact {
  0% { scale: var(--s, 1); }
  70% { scale: calc(var(--s, 1) * 0.5); }
  100% { scale: 0.08; }
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
