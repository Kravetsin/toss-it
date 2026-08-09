import type { CardEffectModule } from '../types';

/**
 * A hex lattice etched INTO the card, with cells firing along it: a hexagon lights somewhere, fills up,
 * and lets go — and the pulse it releases runs outward through the lattice until it is spent. Then it
 * happens again, somewhere else.
 *
 * THE POINT: this is the only card effect whose drawing is not random. Everything else in the catalog
 * is weather — N independent particles falling, drifting or burning wherever they happen to spawn. Here
 * the figure is FIXED and the swarm only lights parts of it, so the card reads as a machine rather than
 * as a card someone poured particles over.
 *
 * ONE PARTICLE IS ONE PULSE, and that is what lets the machine fire anywhere. It began as a single
 * emitter bolted to the card's centre with every other cell timed off its distance from there — which
 * meant one source, one clock, and the same event forever. Now each particle carries its own core AND
 * its own ring, so it can sit on any node, run on its own period, and overlap with the others: some
 * moments have nothing happening, some have three pulses crossing.
 *
 * THE CORE AND ITS RING ARE THE SAME PARTICLE, and that is the whole reason the release looks caused
 * rather than coincidental: they share one element, so they share one duration and one delay and cannot
 * drift apart no matter what either rolls. The previous version had to derive per-cell delays from
 * distance to keep a separate wave in step; none of that arithmetic survives here.
 *
 * WHY A PULSE SITS ON A NODE, and how it can. A cell must land exactly on a lattice node or the whole
 * conceit collapses — but `particle()` never learns the container's size, so a node position cannot be
 * computed from a percentage. Everything is anchored to the CENTRE instead: the mask's tile is 3s×s√3
 * with a hexagon at the tile centre, so `mask-position: center` guarantees a node exactly at the
 * container's centre, and every other node is that point plus a whole number of lattice steps.
 * `particle()` emits those steps as `--dx`/`--dy`. The ring carries its own copy of the same mask,
 * centred on its own box — which is centred on that node — so the two grids coincide exactly, and the
 * light runs along the etched lines rather than across them.
 *
 * THE RING SPREADS BY ITS BACKGROUND, never by a transform: scale or translate the element and the mask
 * goes with it, and the lattice visibly swims. Only the gradient's own size grows under a fixed mask.
 *
 * The lattice itself carries no animation, so it survives `prefers-reduced-motion` as a still etching
 * (same reasoning as the candles' wax) instead of leaving an empty card.
 */

/** Hex side in px, per surface. The lattice period is 3s × s√3 — see the mask below. */
const S_CARD = 10;
const S_COMPACT = 5.5;

/**
 * How many lattice steps out from the centre a pulse may sit. Wide enough to use the card, bounded
 * enough that a pulse never lands entirely off it — `particle()` cannot measure the container, so this
 * is the only handle on where "somewhere else" is allowed to be.
 */
const COLS = { card: 4, compact: 3 };
const ROWS = { card: 3, compact: 1 };

/**
 * The ring's box, in lattice sides: `.p` is 6·REACH_STEPS across, square.
 *
 * The crest does NOT reach the box's edge — a `circle` gradient's radius is its box's half-diagonal
 * (0.707 of the side) and the bright band sits at half of that, so the pulse dies at 0.354 of the box:
 * about 2.1·REACH_STEPS sides, ≈98px on a card. The slack is what keeps the ring from being cropped
 * into arcs by its own box, which is the same trap card-steps fell into.
 */
const REACH_STEPS = 4.6;

/**
 * One lattice tile as a mask (white stroke = the etched line). Flat-top hexagons of side 10 in a
 * 30×17.32 tile: one whole hexagon at the tile's centre plus the four corner ones, which is exactly
 * the honeycomb's two sublattices — centres at (30i, 17.32j) and (30i+15, 17.32j+8.66).
 *
 * `w` is the stroke width: a pill renders the tile at ~half a card's size, and a hairline scaled down
 * with it turns into a shimmering 0.6px line, so the compact variant is drawn thicker to land at the
 * same apparent weight.
 */
const lattice = (w: number): string =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 17.32'%3E%3Cg fill='none' stroke='%23fff' stroke-width='${w}'%3E%3Cpath d='M-5,-8.66 h10 l5,8.66 l-5,8.66 h-10 l-5,-8.66 z' transform='translate(15,8.66)'/%3E%3Cpath d='M-5,-8.66 h10 l5,8.66 l-5,8.66 h-10 l-5,-8.66 z' transform='translate(0,0)'/%3E%3Cpath d='M-5,-8.66 h10 l5,8.66 l-5,8.66 h-10 l-5,-8.66 z' transform='translate(30,0)'/%3E%3Cpath d='M-5,-8.66 h10 l5,8.66 l-5,8.66 h-10 l-5,-8.66 z' transform='translate(0,17.32)'/%3E%3Cpath d='M-5,-8.66 h10 l5,8.66 l-5,8.66 h-10 l-5,-8.66 z' transform='translate(30,17.32)'/%3E%3C/g%3E%3C/svg%3E")`;

export const cardHextech: CardEffectModule = {
  id: 'card-hextech',
  type: 'card_effect',
  costDust: 5000,
  since: '2026-08-07',
  className: 'card-fx-hextech',
  // Enough that pulses sometimes overlap and sometimes leave the card quiet — with rolled periods and
  // rolled delays, how many are firing at once is itself the variable.
  counts: { web: 5, overlayCard: 4, overlayChat: 3 },
  colorUpgrade: 'card-hextech-color',
  labels: { name: 'shop.cardHextech', desc: 'shop.cardHextechDesc' },
  // No `color` here: this effect is tinted at the LAYER (--cos-fx-tint, set by fillCardEffect), because
  // its etched lattice lives on the layer's own pseudo-element, which a per-particle property can never
  // reach — custom properties inherit down, not up.
  particle: (rnd, compact) => {
    const s = compact ? S_COMPACT : S_CARD;
    const cols = compact ? COLS.compact : COLS.card;
    const rows = compact ? ROWS.compact : ROWS.card;
    // The two honeycomb sublattices — the offset one is shifted by half a step on both axes.
    const odd = rnd(0, 1) < 0.5;
    const step = (n: number) => Math.floor(rnd(-n, n + 1));
    // Its own period AND its own phase, both rolled: that is what makes the machine fire at moments
    // rather than on a beat. Two pulses landing together is then just something that happens.
    const dur = rnd(5.5, 9);
    return {
      left: '50%',
      top: '50%',
      '--dx': `${((odd ? 1.5 * s : 0) + 3 * s * step(cols)).toFixed(2)}px`,
      '--dy': `${((odd ? 0.866 * s : 0) + 1.732 * s * step(rows)).toFixed(2)}px`,
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
      // Brightness varies pulse to pulse; timing is already free, so this only has to keep two
      // simultaneous pulses from looking like one effect drawn twice.
      '--peak': rnd(0.78, 1).toFixed(2),
    };
  },
  // Somewhere else every time. Only the node moves: `--dur` may not change under a running animation,
  // and the pulse has no size that would have to change with it.
  respawnKeys: ['--dx', '--dy'],
  css: `
/* Lattice step, per surface, plus the mask both the etching and every ring are drawn with — one value
   in one place, because the two grids have to be the same grid. */
.card-fx-hextech {
  --hex-s: ${S_CARD}px;
  --hex-mask: ${lattice(1.15)};
}
.card-fx-hextech.compact {
  --hex-s: ${S_COMPACT}px;
  /* A pill renders the tile at ~half size; drawn thicker so the line keeps its apparent weight. */
  --hex-mask: ${lattice(1.8)};
}
/* THE ETCHING — always there, never animated. Dim, because it is the thing the light happens ON, not
   the effect itself. \`center\` is load-bearing: it puts a lattice node exactly at the container's
   centre, which is the anchor every pulse is placed from. */
.card-fx-hextech::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    165deg,
    color-mix(in srgb, var(--cos-fx-tint, #6fd8ff) 42%, transparent),
    color-mix(in srgb, var(--cos-fx-tint, #6fd8ff) 14%, transparent)
  );
  opacity: 0.3;
  -webkit-mask-image: var(--hex-mask);
  mask-image: var(--hex-mask);
  -webkit-mask-size: calc(var(--hex-s) * 3) calc(var(--hex-s) * 1.732);
  mask-size: calc(var(--hex-s) * 3) calc(var(--hex-s) * 1.732);
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: repeat;
  mask-repeat: repeat;
}
/* A PULSE — a square box centred on its node, holding the core and the ring it throws. Square because
   the ring is a circle, and a circle gradient in a non-square box is cropped by that box into arcs.
   Unmasked itself, so nothing here clips the glow. */
.card-fx-hextech .p {
  width: calc(var(--hex-s) * ${(REACH_STEPS * 6).toFixed(1)});
  height: calc(var(--hex-s) * ${(REACH_STEPS * 6).toFixed(1)});
  margin-left: calc(var(--dx, 0px) - var(--hex-s) * ${(REACH_STEPS * 3).toFixed(1)});
  margin-top: calc(var(--dy, 0px) - var(--hex-s) * ${(REACH_STEPS * 3).toFixed(1)});
  animation: cardfx-hex-pulse var(--dur, 7s) linear var(--delay, 0s) infinite;
}
/* THE CORE — the hexagon on the node. It fills through most of the cycle and lets go at the top, and
   because the ring below shares this element's clock exactly, the release and the ring leaving are the
   same frame. */
.card-fx-hextech .p::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: calc(var(--hex-s) * 2);
  height: calc(var(--hex-s) * 1.732);
  margin: calc(var(--hex-s) * -0.866) 0 0 calc(var(--hex-s) * -1);
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  background: radial-gradient(
    circle at 50% 50%,
    #fff 0 14%,
    var(--cos-fx-tint, #6fd8ff) 46%,
    color-mix(in srgb, var(--cos-fx-tint, #6fd8ff) 25%, transparent) 100%
  );
  animation: cardfx-hex-core var(--dur, 7s) ease-in-out var(--delay, 0s) infinite;
}
/* THE RING — the pulse itself, running along the lattice because it is drawn THROUGH the same mask,
   centred on the same node. Only its background grows; the mask never moves. */
.card-fx-hextech .p::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle,
    transparent 0 34%,
    color-mix(in srgb, var(--cos-fx-tint, #6fd8ff) 65%, transparent) 42%,
    #ffffff 50%,
    color-mix(in srgb, var(--cos-fx-tint, #6fd8ff) 65%, transparent) 58%,
    transparent 68%
  );
  background-position: center;
  background-repeat: no-repeat;
  background-size: 0 0;
  -webkit-mask-image: var(--hex-mask);
  mask-image: var(--hex-mask);
  -webkit-mask-size: calc(var(--hex-s) * 3) calc(var(--hex-s) * 1.732);
  mask-size: calc(var(--hex-s) * 3) calc(var(--hex-s) * 1.732);
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: repeat;
  mask-repeat: repeat;
  animation: cardfx-hex-ring var(--dur, 7s) linear var(--delay, 0s) infinite;
}
/* The envelope. The dead 2% at the start is not spare time: bindRespawn moves a pulse to its next node
   on the \`animationiteration\` event, which is dispatched a frame or two AFTER the new cycle has begun
   drawing — without a blind head start the core lights up at the OLD node first (see card-claws, where
   this cost a debugging round). */
@keyframes cardfx-hex-pulse {
  0%,
  2% {
    opacity: 0;
  }
  8%,
  88% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
/* THE FILL AND THE RELEASE. Most of the cycle is the core drawing charge — slow, so the letting go is
   worth watching — then a hard flash at 57%, then a spent ember. */
@keyframes cardfx-hex-core {
  0%,
  2% {
    opacity: 0;
    filter: brightness(0.7) drop-shadow(0 0 1px var(--cos-fx-tint, #6fd8ff));
  }
  30% {
    opacity: calc(var(--peak, 1) * 0.42);
    filter: brightness(1.15) drop-shadow(0 0 3px var(--cos-fx-tint, #6fd8ff));
  }
  52% {
    opacity: calc(var(--peak, 1) * 0.72);
    filter: brightness(1.7) drop-shadow(0 0 6px var(--cos-fx-tint, #6fd8ff));
  }
  /* the release — and the ring leaves on this frame */
  57% {
    opacity: var(--peak, 1);
    filter: brightness(2.8) drop-shadow(0 0 12px var(--cos-fx-tint, #6fd8ff));
  }
  64% {
    opacity: calc(var(--peak, 1) * 0.22);
    filter: brightness(0.85) drop-shadow(0 0 2px var(--cos-fx-tint, #6fd8ff));
  }
  100% {
    opacity: calc(var(--peak, 1) * 0.14);
    filter: brightness(0.8) drop-shadow(0 0 1px var(--cos-fx-tint, #6fd8ff));
  }
}
/* THE RING'S TRAVEL. Born at the release, spreading at a steady rate, and fading on a CURVE rather than
   two straight runs — a change of rate at the end is read as the ring winking out instead of dying
   away. It keeps moving while the last of it goes. */
@keyframes cardfx-hex-ring {
  0%,
  55% {
    background-size: 0 0;
    opacity: 0;
  }
  57% {
    background-size: 14% 14%;
    opacity: 1;
  }
  70% {
    opacity: 0.86;
  }
  80% {
    opacity: 0.6;
  }
  90% {
    opacity: 0.28;
  }
  100% {
    background-size: 100% 100%;
    opacity: 0;
  }
}
`,
};
