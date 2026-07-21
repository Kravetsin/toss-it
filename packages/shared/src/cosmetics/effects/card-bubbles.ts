import { DEPTH_BLUR_RATIO_POINT, depthCount, depthPlane, parallaxDur } from '../depth';
import type { CardEffectModule } from '../types';

/**
 * Hollow bubbles rising from the bottom edge, each swaying side to side, that POP near the top
 * instead of dissolving. The closest sibling is card-levitation (same rise-from-a-glowing-origin
 * shape), but a bubble is not a solid mote of light: it is a rim you can see the card THROUGH, it
 * catches a highlight, and it does not fade away quietly — it bursts.
 *
 * Structure mirrors levitation exactly: `.p` is the invisible full-height rising COLUMN (so the
 * climb is a subpixel `%` translate, not a `top` snapped to whole pixels — see levitation's header
 * for why), `::before` is the bubble itself, riding inside the column with its own pop timing.
 *
 * DEPTH (see ../depth): a bubble is round with no shape to lose to blur, so — like levitation and
 * snow — this takes the POINT ratio: nearer is bigger, faster, and drifts wider.
 *
 * The pop is a SEPARATE tail on both the column's opacity and the bubble's scale, timed to land
 * together: the column stays visible through most of the climb and only cuts to 0 in the last
 * stretch, while the bubble's own scale holds steady and then snaps up right as opacity falls — a
 * quick outward burst rather than levitation's slow shrink-to-nothing.
 */
export const cardBubbles: CardEffectModule = {
  id: 'card-bubbles',
  type: 'card_effect',
  costDust: 2500,
  className: 'card-fx-bubbles',
  counts: { web: depthCount(9), overlayCard: depthCount(8), overlayChat: depthCount(6) },
  labels: { name: 'shop.cardBubbles', desc: 'shop.cardBubblesDesc' },
  particle: (rnd, compact, index) => {
    const plane = depthPlane(index);
    const nearS = compact ? rnd(1.4, 1.9) : rnd(1.7, 2.5);
    const s = plane === 'near' ? nearS : plane === 'far' ? rnd(0.3, 0.5) : rnd(0.6, 1.3);
    // A touch lazier than levitation's dots — buoyancy reads slower than a mote of light rising.
    const dur = parallaxDur(4.6, s, rnd(0.9, 1.1));
    return {
      left: `${rnd(2, 98).toFixed(1)}%`,
      '--drift': `${(rnd(-16, 16) * (plane === 'near' ? 1.5 : plane === 'far' ? 0.5 : 1)).toFixed(0)}px`,
      '--s': s.toFixed(2),
      // 9, not 4: the blur ratio hangs off the bubble's OWN rendered size (a 9px rim, see the css),
      // not levitation's 4px dot — using the wrong base size would under-blur the near/far planes.
      '--blur': `${(9 * s * DEPTH_BLUR_RATIO_POINT[plane]).toFixed(2)}px`,
      '--op': ((compact ? 0.85 : 0.75) * (plane === 'far' ? 0.7 : 1)).toFixed(2),
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Origin bloom where the bubble emerges from the bottom edge — same role as levitation's, just
  // recoloured. In-focus plane only: a bubble floating in front of the lens never surfaced here.
  groundGlow: (p) => ({
    ...(p['--blur'] === '0.00px' ? {} : { display: 'none' }),
    left: p.left ?? '50%',
    '--dur': p['--dur'] ?? '4.6s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
.card-fx-bubbles .p {
  top: 0;
  width: 0;
  height: 100%;
  filter: blur(var(--blur, 0));
  animation: cardfx-bubbles-rise var(--dur, 4.6s) linear var(--delay, 0s) infinite;
}
/* The rim: a highlight baked into ONE radial gradient rather than a second element (only one
   pseudo is left per particle — see CardEffectModule.groundGlow's '.g' for the other). */
.card-fx-bubbles .p::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid rgba(200, 230, 255, 0.55);
  background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.55), rgba(190, 225, 255, 0.08) 60%, transparent 75%);
  box-shadow: 0 0 4px rgba(180, 225, 255, 0.4);
  scale: var(--s, 1);
  animation: cardfx-bubbles-pop var(--dur, 4.6s) linear var(--delay, 0s) infinite;
}
/* Enters from under the edge exactly like levitation's dot (the extra 9px*--s clears the bubble's
   own rendered size at any plane); stays visible through most of the climb, then cuts to 0 late —
   the pop (below) is timed to land in that same window, so the burst and the fade coincide. */
@keyframes cardfx-bubbles-rise {
  0% {
    translate: 0 calc(100% + 9px * var(--s, 1));
    opacity: 0;
  }
  6% {
    opacity: var(--op, 0.75);
  }
  82% {
    opacity: var(--op, 0.75);
    translate: var(--drift, 0) 2%;
  }
  92%,
  100% {
    opacity: 0;
    translate: var(--drift, 0) -6%;
  }
}
/* Scale ramp starts exactly where the rise's opacity starts falling (82%, not a hair earlier) — the
   two used to be 2 points out of step, which read as the bubble swelling for a beat while still
   fully opaque instead of holding steady until the burst. */
@keyframes cardfx-bubbles-pop {
  0%,
  82% {
    scale: var(--s, 1);
  }
  92%,
  100% {
    scale: calc(var(--s, 1) * 1.7);
  }
}
.card-fx-bubbles.compact .p {
  animation-name: cardfx-bubbles-rise-compact;
}
.card-fx-bubbles.compact .p::before {
  animation-name: cardfx-bubbles-pop-compact;
}
@keyframes cardfx-bubbles-rise-compact {
  0% {
    translate: 0 135%;
    opacity: 0;
  }
  18% {
    opacity: var(--op, 0.85);
  }
  70% {
    opacity: var(--op, 0.85);
    translate: var(--drift, 0) 10%;
  }
  84%,
  100% {
    opacity: 0;
    translate: var(--drift, 0) -35%;
  }
}
@keyframes cardfx-bubbles-pop-compact {
  0%,
  70% {
    scale: var(--s, 1);
  }
  84%,
  100% {
    scale: calc(var(--s, 1) * 1.7);
  }
}
.card-fx-bubbles .g {
  width: 22px;
  height: 2px;
  margin-left: -11px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, #bce3ff, transparent);
  box-shadow: 0 0 6px #9ad6ff;
  animation: cardfx-bubbles-glow var(--dur, 4.6s) ease-out var(--delay, 0s) infinite;
}
@keyframes cardfx-bubbles-glow {
  0% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  8% {
    opacity: 0.5;
    transform: scaleX(1);
  }
  34% {
    opacity: 0;
    transform: scaleX(1.25);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.25);
  }
}
.card-fx-bubbles.compact .g {
  animation-name: cardfx-bubbles-glow-compact;
}
@keyframes cardfx-bubbles-glow-compact {
  0%,
  15% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  22% {
    opacity: 0.5;
    transform: scaleX(1);
  }
  46% {
    opacity: 0;
    transform: scaleX(1.25);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.25);
  }
}
`,
};
