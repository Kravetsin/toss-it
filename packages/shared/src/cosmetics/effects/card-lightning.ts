import type { CardEffectModule } from '../types';

/**
 * A bolt strikes the bottom edge and blows a flare out of the ground. The rare-event rhythm the nick
 * could not carry: ~95% of the cycle there is nothing at all, then a ~0.3s double-flicker. A card is
 * a big enough canvas for that to read as an event rather than as absence.
 *
 * Shape: the module can only emit styles, never markup — so the bolt is ONE element with a
 * `clip-path` polygon generated per particle. The outline runs down the left side through two bends,
 * hits the tip, and comes back up the right side, thinning as it goes; every viewer's bolt is a
 * different shape. Deliberately angular (anime), not fractal: a couple of bends read at 40px, a
 * branching tree does not.
 *
 * Two tricks worth keeping:
 * - The tip is FIXED at 50% of the element and the element is centred on its spawn column
 *   (`translate: -50%`). That is what lets the ground flare sit at plain `left: <spawn>` with no
 *   maths — compare card-stardust, which has to reproduce its own drift in the glow's `left`.
 * - `aspect-ratio` ties the bolt's width to the card's height, so the zigzag keeps its proportions
 *   in a 192px card and a 40px row alike. Doing that with container units would reintroduce the
 *   resize bug the falling effects just escaped.
 *
 * Nothing moves here, so none of the px/s smoothness rules apply: a bolt appears, it does not fall.
 */
export const cardLightning: CardEffectModule = {
  id: 'card-lightning',
  type: 'card_effect',
  costDust: 4000,
  className: 'card-fx-lightning',
  // Strike rate ≈ count / dur: ~1.5s between strikes on a card, ~1.1s on an alert, ~2.3s in a pill.
  counts: { web: 3, overlayCard: 4, overlayChat: 2 },
  labels: { name: 'shop.cardLightning', desc: 'shop.cardLightningDesc' },
  particle: (rnd, compact) => {
    const dur = rnd(3.5, 5.5);
    // Randomising the SEGMENT COUNT is what makes every bolt a different bolt rather than one
    // silhouette shifted around — and more bends read as more electric. Both surfaces want plenty:
    // nobody counts the bends, they read the vibe at a glance, and density IS the vibe. `compact`
    // only shifts the range down a little and unlocks the wider swing below — the SHAPE is
    // generated, so no amount of `.compact` CSS could adjust it downstream.
    const segments = compact ? Math.floor(rnd(4, 6.99)) : Math.floor(rnd(5, 8.99));
    // On a card the swing shrinks as bends multiply: without that the segments get shorter
    // vertically while still wandering just as far sideways, and the bolt becomes a zigzag ribbon.
    // A pill gets a FIXED generous swing instead — compensated at that scale the zigzag would be
    // narrower than the 2px line drawing it, i.e. a straight stick. Many bends in a short box are
    // unavoidably more diagonal; at pill size that density is exactly what reads as electric.
    const swing = () => (compact ? rnd(20, 36) : rnd(16, 40) * (3 / segments));
    // Thickness in PIXELS, tapering to a point at the tip. Not a % of the element: the element's
    // width scales with the card, so a % would give a 2px hairline in a leaderboard row and a 10px
    // slab in a full card. Every other effect is a fixed thin line (meteor 2px, rain 1.5px) — that
    // constancy is what reads as density.
    const w0 = rnd(1.8, 2.6);

    // Run lengths are deliberately UNEVEN (one segment 5% of the height, the next 30%). Evenly
    // spaced nodes + strictly alternating sides + a constant swing is a sawtooth, and the eye reads
    // a regular sawtooth as a tilted ribbon no matter how many bends it has — that was the "too
    // wide and slanted" of the first version. A real bolt is long near-vertical runs broken by the
    // occasional sharp kink: the IRREGULARITY is the lightning, not the bend count.
    const weights = Array.from({ length: segments }, () => rnd(0.35, 2.2));
    const total = weights.reduce((a, b) => a + b, 0);
    const ys: number[] = [0];
    let acc = 0;
    for (let i = 0; i < segments; i++) {
      acc += (weights[i]! / total) * 100;
      ys.push(i === segments - 1 ? 100 : acc);
    }

    const xs: number[] = [];
    const ws: number[] = [];
    let side = rnd(0, 1) < 0.5 ? -1 : 1;
    for (let i = 0; i <= segments; i++) {
      const t = ys[i]! / 100;
      // The channel funnels into the strike: wide wander up top, tight near the ground. Physically
      // right, and it walks the eye down to the flare.
      const converge = 0.35 + 0.65 * (1 - t);
      // The tip is pinned to the centre so the ground flare needs no maths of its own.
      xs.push(i === segments ? 50 : 50 + side * swing() * converge);
      ws.push(w0 * Math.pow(1 - t, 0.9));
      // Only USUALLY flip. Two jogs the same way read as drift; always flipping draws a sine.
      if (rnd(0, 1) > 0.25) side = -side;
    }

    // A spur that dies in the air. A fork is THE lightning silhouette — every lightning icon ever
    // drawn has one — so it buys recognition at a glance, which is the whole brief. Half the bolts
    // get one, making it a third axis of variety on top of bend count and run lengths. Compact
    // skips it: in a 33px pill a spur is a pixel.
    const forked = !compact && rnd(0, 1) < 0.5;
    // Never the top node and never the tip: a spur off the strike point would read as a second bolt.
    const branchAt = forked ? 1 + Math.floor(rnd(0, segments - 2)) : -1;
    // Outward, i.e. the way the bolt already leans — inward would cross its own body.
    const branchDir = branchAt > 0 && xs[branchAt]! > 50 ? 1 : -1;
    // Clamped inside the box: the element paints nothing outside it, so an over-long spur would
    // just get its tip lopped off.
    const bx = Math.min(97, Math.max(3, (xs[branchAt] ?? 50) + branchDir * rnd(9, 20)));
    const by = Math.min(96, (ys[branchAt] ?? 50) + rnd(6, 14));
    // Root thickness in px, like the trunk's — thinner, since a branch is a lesser channel.
    const bRoot = w0 * 0.55;

    // clip-path takes any <length-percentage>, so a point is a % plus an optional px offset — that
    // is what keeps the bolt a constant-width hairline on a size-relative zigzag.
    const co = (v: number, px = 0) =>
      px ? `calc(${v.toFixed(1)}% + ${px.toFixed(2)}px)` : `${v.toFixed(1)}%`;
    const P = (x: number, y: number, dxPx = 0, dyPx = 0) => `${co(x, dxPx)} ${co(y, dyPx)}`;

    const points: string[] = [];
    // Left edge, down to the tip. A left-going spur detours here: out to its tip, then back to a
    // hair below the root, then on down the trunk.
    for (let i = 0; i <= segments; i++) {
      points.push(P(xs[i]!, ys[i]!));
      if (i === branchAt && branchDir < 0) {
        points.push(P(bx, by));
        points.push(P(xs[i]!, ys[i]!, 0, bRoot));
      }
    }
    // Right edge, back up. A right-going spur detours here — same shape, walked in reverse.
    for (let i = segments - 1; i >= 0; i--) {
      if (i === branchAt && branchDir > 0) {
        points.push(P(xs[i]!, ys[i]!, ws[i]!, bRoot));
        points.push(P(bx, by));
      }
      points.push(P(xs[i]!, ys[i]!, ws[i]!));
    }

    return {
      left: `${rnd(12, 88).toFixed(1)}%`,
      // A pill is ~33px tall, so a card's ratio would leave the bolt ~8px wide — no room for a
      // zigzag to exist at all. Wider here buys the swing somewhere to go.
      '--ar': (compact ? rnd(0.34, 0.48) : rnd(0.2, 0.32)).toFixed(3),
      clipPath: `polygon(${points.join(', ')})`,
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // The tip always lands on the spawn column (see above), so the flare needs no offset of its own.
  groundGlow: (p) => ({
    left: p.left ?? '50%',
    '--dur': p['--dur'] ?? '6s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
.card-fx-lightning .p {
  top: 0;
  height: 100%;
  /* Width follows the card's height, so the zigzag keeps its angles at any size. */
  aspect-ratio: var(--ar, 0.26);
  /* Centre the element on its spawn column: the tip is at the element's 50%. */
  translate: -50% 0;
  background: #ffffff;
  /* drop-shadow filters the CLIPPED result, so the halo traces the bolt instead of its box. Kept
     tight (2/7px, like the meteor's 3px): a wide soft halo turns a hairline into a smudge. */
  filter: drop-shadow(0 0 2px #ffffff) drop-shadow(0 0 7px #a78bfa);
  animation: cardfx-lightning-strike var(--dur, 6s) linear var(--delay, 0s) infinite;
}
/* Dead for most of the cycle, then a double flicker — a single clean fade reads as a lamp, not a
   strike. Paused (reduced-motion) it rests on the 0% frame: invisible, card simply clean.
   The window is a % of --dur, so it widened when the cycle shortened — otherwise raising the strike
   rate would have quietly clipped each strike shorter. 10% of 3.5-5.5s ≈ 0.35-0.55s. */
@keyframes cardfx-lightning-strike {
  0%,
  86% {
    opacity: 0;
  }
  87% {
    opacity: 1;
  }
  89% {
    opacity: 0.3;
  }
  91% {
    opacity: 1;
  }
  96%,
  100% {
    opacity: 0;
  }
}
/* The flare speaks the same language as every other ground glow — a dense 2px line with a gradient
   falloff — just brighter and wider, because this one is a strike and not a landing. A radial oval
   was the first attempt and read as cheap: the density lives in the hairline, not in a soft blob. */
.card-fx-lightning .g {
  width: 44px;
  height: 2px;
  margin-left: -22px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, #ffffff 42%, #ffffff 58%, transparent);
  box-shadow:
    0 0 9px #a78bfa,
    0 0 20px #7c3aed;
  animation: cardfx-lightning-flare var(--dur, 6s) linear var(--delay, 0s) infinite;
}
/* A low bloom licking up off the impact — kept faint and small so the line above stays the subject. */
.card-fx-lightning .g::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 30px;
  height: 13px;
  translate: -50% 0;
  background: radial-gradient(closest-side at 50% 100%, rgba(196, 181, 253, 0.5), transparent 72%);
}
/* Phased to the bolt above, keyframe for keyframe — the flare IS the strike landing. */
@keyframes cardfx-lightning-flare {
  0%,
  86% {
    opacity: 0;
    transform: scaleX(0.2);
  }
  87% {
    opacity: 1;
    transform: scaleX(1);
  }
  89% {
    opacity: 0.35;
  }
  91% {
    opacity: 0.9;
    transform: scaleX(1.12);
  }
  96%,
  100% {
    opacity: 0;
    transform: scaleX(1.45);
  }
}
`,
};
