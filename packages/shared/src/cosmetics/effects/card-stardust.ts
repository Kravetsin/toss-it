import { DEPTH_BLUR_RATIO_POINT, depthCount, depthPlane, parallaxDur } from '../depth';
import type { CardEffectModule } from '../types';

/**
 * Mint meteors raining diagonally down to the bottom edge, each flaring in a line of light exactly
 * where it exits. Meteors share one fixed direction; the sideways travel scales with the card
 * height via container-query units (27.4cqh = tan(14°) × the 110% vertical run) so the path is
 * exactly -14° — the bar's rotation — in ANY card height; a px fallback keeps old engines close.
 * They fall to `top: 100%` so the impact glow (a `g` element at the exit column, positioned by the
 * same math off --x and synced via --dur/--delay) lands on the meteor. The `.compact` variant is
 * near-straight for short rows and drops the glows.
 *
 * DEPTH (see ../depth): like rain, a meteor is a STREAK — the blur ratio hangs off its WIDTH (the
 * cross-section a defocus actually acts on), not its length, which would fog a 40px near meteor into
 * nothing. Nearer = wider, longer, faster; only the in-focus plane flares at the bottom.
 *
 * The angle is deliberately NOT a depth cue: all three planes keep the exact -14°, because the
 * flare's position is derived from that same constant. Depth here is speed and softness — the line
 * they fly along stays put. Note the sideways travel is no longer a bare constant: a meteor now
 * starts a full length above the card (see the keyframes), so its own run is 110% of the card PLUS
 * its length, and the travel has to carry a `tan(14°) × length` term to hold the angle at -14°. The
 * flare's 27.4cqh is untouched, because the TIP's run is still exactly 110%.
 */
export const cardStardust: CardEffectModule = {
  id: 'card-stardust',
  type: 'card_effect',
  costDust: 3500,
  className: 'card-fx-stardust',
  // In-focus density; depthCount adds the off-focus planes on top rather than out of it (../depth).
  counts: { web: depthCount(7), overlayCard: depthCount(10), overlayChat: depthCount(6) },
  labels: { name: 'shop.cardStardust', desc: 'shop.cardStardustDesc' },
  particle: (rnd, compact, index) => {
    const plane = depthPlane(index);
    // Width is the depth axis (the streak's cross-section); length rides along with it.
    const nearW = compact ? rnd(3, 3.8) : rnd(4, 5);
    const w = plane === 'near' ? nearW : plane === 'far' ? rnd(1.2, 1.6) : rnd(1.8, 2.2);
    const z = w / 2;
    const len = rnd(16, 28) * z;
    const dur = parallaxDur(2.4, z, rnd(0.85, 1.15));
    return {
      left: `${rnd(-8, 94).toFixed(1)}%`,
      height: `${len.toFixed(0)}px`,
      // The length again, as a var: the keyframes need it to keep the angle honest once the meteor
      // starts a whole length above the card (see the css).
      '--len': `${len.toFixed(0)}px`,
      '--w': `${w.toFixed(2)}px`,
      '--blur': `${(w * DEPTH_BLUR_RATIO_POINT[plane]).toFixed(2)}px`,
      '--op': plane === 'far' ? '0.65' : '0.9',
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Impact glow at the meteor's exit column: spawn x goes in --x; the css adds the same
  // height-proportional sideways travel as the fall so the glow sits under the landing tip.
  // In-focus plane only: a meteor in front of the lens exits nowhere near this card's edge.
  groundGlow: (p) => ({
    ...(p['--blur'] === '0.00px' ? {} : { display: 'none' }),
    '--x': p.left ?? '50%',
    '--dur': p['--dur'] ?? '2.6s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
/* Size container so children can use cqh (1% of layer height) for height-proportional travel. */
.card-fx-stardust {
  container-type: size;
}
.card-fx-stardust .p {
  width: var(--w, 2px);
  height: 20px;
  border-radius: 2px;
  background: linear-gradient(to bottom, transparent, var(--cos-mint, #8df0cc));
  /* Defocus joins the existing filter chain rather than replacing it — filter is ONE property, and a
     second declaration would silently drop the meteor's glow. The trail's own bloom scales with the
     meteor (a fixed radius made a 5px near meteor glow like a 2px one, flattening the depth). The
     transform here is translate+rotate with no scale, so this blur stays screen px. */
  filter: blur(var(--blur, 0)) drop-shadow(0 0 calc(var(--w, 2px) * 1.5) var(--cos-mint, #8df0cc));
  animation: cardfx-fall var(--dur, 2.6s) linear var(--delay, 0s) infinite;
}
/* The meteor ENTERS from off the top edge instead of fading in mid-card. translateY(-100%) is a %
   of the meteor's OWN length, so at 0% the whole streak sits above the card however long the near
   plane made it — and, crucially, that puts its TIP exactly on the old spawn line for every meteor
   alike. The tip's run is therefore still 110% of the card, which is what 27.4cqh (and the flare's
   position below) was derived from: both stay correct, untouched.
   The ELEMENT's run does grow by one length, so the sideways travel has to grow by tan(14°) × that
   length — otherwise the angle would flatten, and flatten differently per meteor, breaking the one
   thing these share. Opacity goes flat: parked outside at both ends, there is nothing to fade.
   Duplicated transform lines = px fallback for engines without container-query units. */
@keyframes cardfx-fall {
  0% {
    top: -10%;
    opacity: var(--op, 0.9);
    transform: translate(0, -100%) rotate(-14deg);
  }
  100% {
    top: 100%;
    opacity: var(--op, 0.9);
    transform: translate(calc(45px + var(--len, 20px) * 0.2493), 0) rotate(-14deg);
    transform: translate(calc(27.4cqh + var(--len, 20px) * 0.2493), 0) rotate(-14deg);
  }
}
.card-fx-stardust.compact .p {
  animation-name: cardfx-fall-compact;
}
/* Same treatment; the compact run is 215% of the row, hence 53.6cqh, and the tip's own run is 175%
   — which is what the compact flare's 43.6cqh below comes from, and it too is unchanged. */
@keyframes cardfx-fall-compact {
  0% {
    top: -75%;
    opacity: var(--op, 0.9);
    transform: translate(0, -100%) rotate(-14deg);
  }
  100% {
    top: 140%;
    opacity: var(--op, 0.9);
    transform: translate(calc(22px + var(--len, 20px) * 0.2493), 0) rotate(-14deg);
    transform: translate(calc(53.6cqh + var(--len, 20px) * 0.2493), 0) rotate(-14deg);
  }
}
.card-fx-stardust .g {
  left: calc(var(--x, 50%) + 45px);
  left: calc(var(--x, 50%) + 27.4cqh);
  width: 22px;
  height: 2px;
  margin-left: -11px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, var(--cos-mint, #8df0cc), transparent);
  box-shadow: 0 0 7px var(--cos-mint, #8df0cc);
  animation: cardfx-star-impact var(--dur, 2.6s) ease-out var(--delay, 0s) infinite;
}
@keyframes cardfx-star-impact {
  0%,
  84% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  93% {
    opacity: 0.7;
    transform: scaleX(1);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.5);
  }
}
/* Compact rows: the meteor crosses the row bottom at 81.4% of the timeline ((100+75)/215), with
   81.4% of its 53.6cqh sideways travel done — the glow sits and fires exactly there. */
.card-fx-stardust.compact .g {
  left: calc(var(--x, 50%) + 18px);
  left: calc(var(--x, 50%) + 43.6cqh);
  animation-name: cardfx-star-impact-compact;
}
@keyframes cardfx-star-impact-compact {
  0%,
  73% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  82% {
    opacity: 0.7;
    transform: scaleX(1);
  }
  91% {
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
