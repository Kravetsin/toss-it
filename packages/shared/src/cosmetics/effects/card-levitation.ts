import { DEPTH_BLUR_RATIO_POINT, depthCount, depthPlane, parallaxDur } from '../depth';
import type { CardEffectModule } from '../types';

/**
 * Mint dots drifting upward across the card, each rising out of a soft glow that blooms at its
 * origin on the bottom edge. The `.compact` variant (leaderboard rows, chat pills) flies a
 * trajectory that starts/ends OUTSIDE the row — a whole dot is only seen while crossing, confined
 * to its row.
 *
 * DEPTH (see ../depth): a defocused point of light is a bokeh ball, so like snow this takes the near
 * plane for free and uses the POINT blur ratio — nearer = bigger, faster, wider drift, and only the
 * in-focus plane blooms at the bottom. The rise ALREADY shrinks each dot as it climbs; that is a
 * different cue (distance travelled, not distance from the lens) and the two stack rather than
 * fight, since the shrink is relative to whatever --s its plane handed out.
 *
 * The blur goes on the COLUMN, never on the dot: a filter is applied in the element's own space and
 * then scaled by that element's transform, so blur sharing an element with the shrink would fade
 * out as the dot burns down to 0.35. The column carries no scale, so its blur is screen px.
 *
 * Structure (same as snow/sakura): `.p` is an invisible full-height COLUMN that carries the rise,
 * `::before` is the dot. The rise is a `%` translate, NOT `top`: `top` is a layout property snapped
 * to whole pixels, and at ~16px/s in a leaderboard row that reads as ~16 one-pixel jumps a second —
 * next to the smooth effects it looks like lag. A column that is `height: 100%` of the layer makes
 * `translate: 0 X%` mean exactly what `top: X%` used to, but composited and subpixel — and it
 * re-measures on every layout, so an expanding card is handled for free (container units are not:
 * they don't reliably recompute on a resize).
 *
 * The dot also shrinks as it climbs, and that CANNOT ride on the column — scaling it would scale
 * its height and break the percentages. It lives on `::before` as its own animation, sharing
 * --dur/--delay so the two stay in step.
 */
export const cardLevitation: CardEffectModule = {
  id: 'card-levitation',
  type: 'card_effect',
  costDust: 2500,
  className: 'card-fx-levitation',
  // In-focus density; depthCount adds the off-focus planes on top rather than out of it (../depth).
  counts: { web: depthCount(10), overlayCard: depthCount(14), overlayChat: depthCount(8) },
  labels: { name: 'shop.cardLevitation', desc: 'shop.cardLevitationDesc' },
  particle: (rnd, compact, index) => {
    const plane = depthPlane(index);
    // A 4px dot × --s. Near stays modest in a 40px row, and the blur carries the defocus instead.
    const nearS = compact ? rnd(1.5, 2) : rnd(1.8, 2.6);
    const s = plane === 'near' ? nearS : plane === 'far' ? rnd(0.3, 0.5) : rnd(0.65, 1.35);
    // Speed follows SIZE, not the plane (see parallaxDur) — a big dot dawdling past a small one
    // breaks depth from inside the in-focus plane, where --s already spans ~2×.
    const dur = parallaxDur(3.7, s, rnd(0.9, 1.1));
    return {
      left: `${rnd(2, 98).toFixed(1)}%`,
      '--drift': `${(rnd(-18, 18) * (plane === 'near' ? 1.6 : plane === 'far' ? 0.5 : 1)).toFixed(0)}px`,
      '--s': s.toFixed(2),
      // Blur tracks the dot's RENDERED size (4px × --s) — one lens across all three planes.
      '--blur': `${(4 * s * DEPTH_BLUR_RATIO_POINT[plane]).toFixed(2)}px`,
      // Compact rows run a touch brighter (their own keyframes always did); distance dims only the
      // far plane — a blurred dot that is ALSO faded reads as dirt rather than depth.
      '--op': ((compact ? 0.9 : 0.8) * (plane === 'far' ? 0.75 : 1)).toFixed(2),
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Glow sits at the dot's spawn column and blooms as the dot emerges from the bottom. In-focus
  // plane only: a dot floating in front of the lens never rose off this card.
  groundGlow: (p) => ({
    ...(p['--blur'] === '0.00px' ? {} : { display: 'none' }),
    left: p.left ?? '50%',
    '--dur': p['--dur'] ?? '3.4s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
/* The rising column: invisible, zero-width, exactly as tall as the layer — which is what makes a
   % translate below mean "% of the card" and re-measure whenever the card resizes. */
.card-fx-levitation .p {
  top: 0;
  width: 0;
  height: 100%;
  /* Defocus on the column: it carries no scale, so this is screen px (see the header). */
  filter: blur(var(--blur, 0));
  animation: cardfx-rise var(--dur, 3.4s) linear var(--delay, 0s) infinite;
}
/* The dot itself rides inside the column; its shrink shares --dur/--delay to stay in step. */
.card-fx-levitation .p::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--cos-mint, #8df0cc);
  box-shadow: 0 0 6px var(--cos-mint, #8df0cc);
  animation: cardfx-rise-shrink var(--dur, 3.4s) linear var(--delay, 0s) infinite;
}
/* The dot RISES INTO the card from under its edge instead of fading in mid-air. A plain 100%
   translate parked the dot's box exactly ON the bottom edge, so a near-plane dot poked in — and then
   the fade-in did the rest: by 14% of the cycle it was 12px INSIDE the card, blooming out of
   nothing. The extra 4px×--s is the dot's own rendered size, which is the only distance that clears
   it whatever the plane made it, and the layer's overflow clip does the reveal.
   Opacity now starts full: parked outside, there is nothing to hide. It still fades out on the way
   up (the dot dissolves as it climbs) and it stays IN the keyframes, so animation-less
   reduced-motion still falls back to the base 0. Compact is untouched: its trajectory already
   starts a whole row below (135%), which is exactly what this teaches the full-size one. */
@keyframes cardfx-rise {
  0% {
    translate: 0 calc(100% + 4px * var(--s, 1));
    opacity: var(--op, 0.8);
  }
  100% {
    translate: var(--drift, 0) -8%;
    opacity: 0;
  }
}
@keyframes cardfx-rise-shrink {
  0% {
    scale: var(--s, 1);
  }
  100% {
    scale: calc(var(--s, 1) * 0.35);
  }
}
.card-fx-levitation.compact .p {
  animation-name: cardfx-rise-compact;
}
.card-fx-levitation.compact .p::before {
  animation-name: cardfx-rise-shrink-compact;
}
@keyframes cardfx-rise-compact {
  0% {
    translate: 0 135%;
    opacity: 0;
  }
  22% {
    opacity: var(--op, 0.9);
  }
  78% {
    opacity: var(--op, 0.9);
  }
  100% {
    translate: var(--drift, 0) -35%;
    opacity: 0;
  }
}
@keyframes cardfx-rise-shrink-compact {
  0% {
    scale: var(--s, 1);
  }
  100% {
    scale: calc(var(--s, 1) * 0.5);
  }
}
.card-fx-levitation .g {
  width: 26px;
  height: 2px;
  margin-left: -13px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, var(--cos-mint, #8df0cc), transparent);
  box-shadow: 0 0 6px var(--cos-mint, #8df0cc);
  animation: cardfx-levitation-glow var(--dur, 3.4s) ease-out var(--delay, 0s) infinite;
}
@keyframes cardfx-levitation-glow {
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
/* Compact rows: the dot enters from below at 20.6% of the timeline ((135-100)/170), not at 0%. */
.card-fx-levitation.compact .g {
  animation-name: cardfx-levitation-glow-compact;
}
@keyframes cardfx-levitation-glow-compact {
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
