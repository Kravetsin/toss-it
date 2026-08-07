import type { CardEffectModule } from '../types';

/**
 * A hex lattice etched INTO the card: energy runs along it, and single cells charge up and discharge
 * in a flash.
 *
 * THE POINT: this is the only card effect whose drawing is not random. Everything else in the catalog
 * is weather — N independent particles falling, drifting or burning wherever they happen to spawn.
 * Here the figure is FIXED and the swarm only lights parts of it, so the card reads as a machine
 * rather than as a card someone poured particles over.
 *
 * IT BREATHES. One pulse gathers at the centre, swells outward as a ring, and dies at the edge; then
 * the card is quiet until the next breath. The whole layer runs on that ONE clock (WAVE seconds, every
 * element `delay: 0` apart from the cells' distance offset), which is what makes it read as a single
 * organism rather than as parts that happen to be animated — the same trick as the candles' gust.
 *
 * THE CELLS ANSWER THE WAVE. A cell's `--delay` is derived from its DISTANCE to the centre, so it
 * discharges exactly as the ring passes over it and the flashes ripple outward in order. That is also
 * why cells no longer respawn elsewhere: the delay encodes where the cell IS, and `animation-delay`
 * cannot be changed on a running animation — a re-rolled node would fire at the wrong moment forever
 * after. Fixed nodes are the honest reading anyway; a circuit's contacts don't wander.
 *
 * (The ring's radius is a percentage of the container while a cell's distance is in px, so the sync is
 * exact in ORDER and approximate in timing on unusually wide surfaces. Ordering is what the eye reads.)
 *
 * THREE LAYERS, ONE MASK. The lattice (`::before`) and the travelling charge (`::after`) share the
 * exact same SVG mask; only the charge's own BACKGROUND grows under it. That is what makes the light
 * spread ALONG the lines instead of a lit shape sliding across them — scale or translate the element
 * and the mask goes with it, and the lattice visibly swims. The cells are `.p` particles on top.
 *
 * WHY CELLS ARE PLACED FROM THE CENTRE. A cell must land exactly on a lattice node or the whole
 * conceit collapses — but `particle()` never learns the container's size, so a node position cannot be
 * computed from a percentage. Instead both mask and cells are anchored to the CENTRE: the mask's tile
 * is 3s×s√3 with its own hexagon at the tile centre, so `mask-position: center` guarantees a node
 * exactly at the container's centre, and every other node is that point plus a whole number of lattice
 * steps. `particle()` emits those steps as `--dx`/`--dy`, and the alignment holds at any size, on any
 * surface. It also concentrates the cells in the middle band, which is where they belong.
 *
 * The lattice keeps a static opacity under its breathing animation, so it survives
 * `prefers-reduced-motion` as a still etching (same reasoning as the candles' wax) instead of leaving
 * an empty card.
 */

/** Hex side in px, per surface. The lattice period is 3s × s√3 — see the mask below. */
const S_CARD = 10;
const S_COMPACT = 5.5;

/**
 * How many lattice steps out from the centre a cell may sit. Small on purpose: the cells stay in the
 * card's middle band instead of hiding in the corner of a wide feed card.
 */
const COLS = { card: 4, compact: 3 };
const ROWS = { card: 2, compact: 1 };

/** The farthest node those ranges can produce, in px — the yardstick both the delays and the ring use. */
const farthestNode = (s: number, cols: number, rows: number): number =>
  Math.hypot(1.5 * s + 3 * s * cols, 0.866 * s + 1.732 * s * rows);

/**
 * Where the ring's bright band sits, as a fraction of the gradient BOX's side. A `circle` gradient
 * defaults to farthest-corner, so in a square box of side L its radius is 0.707L and the band (at 50%
 * of that radius) lands at 0.354L. Inverting it turns "the wave should be r px across" into a
 * background-size — which is how the ring and the cells stay on the same ruler.
 */
const BAND = 0.354;

/** Gradient box side, in px, that puts the band exactly on the outermost node of a surface. */
const reachSize = (s: number, cols: number, rows: number): number =>
  farthestNode(s, cols, rows) / BAND;

/**
 * The breath, in seconds — the single clock every layer of this effect runs on. Shared between the CSS
 * (every `animation-duration` below) and `particle()` (which converts a cell's distance into a delay
 * on this same clock), so the two can never drift apart.
 */
const WAVE = 7;
/** Fraction of the breath at which the ring leaves the centre, and at which it has crossed the card. */
const BORN = 0.1;
const REACH = 0.58;
/** Where a cell's discharge sits inside its own (identical, WAVE-long) cycle. */
const FLASH = 0.5;

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
  counts: { web: 5, overlayCard: 4, overlayChat: 3 },
  colorUpgrade: 'card-hextech-color',
  labels: { name: 'shop.cardHextech', desc: 'shop.cardHextechDesc' },
  // No `color` here: this effect is tinted at the LAYER (--cos-fx-tint, set by fillCardEffect), because
  // its lattice and charge live on the layer's own pseudo-elements, which a per-particle property can
  // never reach — custom properties inherit down, not up.
  particle: (rnd, compact) => {
    const s = compact ? S_COMPACT : S_CARD;
    const cols = compact ? COLS.compact : COLS.card;
    const rows = compact ? ROWS.compact : ROWS.card;
    // The two honeycomb sublattices — the offset one is shifted by half a step on both axes.
    const odd = rnd(0, 1) < 0.5;
    const step = (n: number) => Math.floor(rnd(-n, n + 1));
    const dx = (odd ? 1.5 * s : 0) + 3 * s * step(cols);
    const dy = (odd ? 0.866 * s : 0) + 1.732 * s * step(rows);
    // WHEN THE WAVE GETS HERE. The farthest node is the yardstick — the ring is sized to land on it
    // exactly at REACH (see reachSize), so a distance normalises to 0…1 without anyone knowing the
    // container. The delay is then whatever puts this cell's FLASH on that instant — negative, and
    // taken modulo the breath, so a far cell simply fires on the tail of the previous one.
    const arrive =
      BORN + Math.min(1, Math.hypot(dx, dy) / farthestNode(s, cols, rows)) * (REACH - BORN);
    const phase = ((((FLASH - arrive) * WAVE) % WAVE) + WAVE) % WAVE;
    return {
      left: '50%',
      top: '50%',
      '--dx': `${dx.toFixed(2)}px`,
      '--dy': `${dy.toFixed(2)}px`,
      '--delay': `${(-phase).toFixed(2)}s`,
      // The one thing left to chance. Timing is spoken for by the wave, so variety has to come out of
      // AMPLITUDE — otherwise every node fires at identical brightness and the ripple looks stamped.
      '--peak': rnd(0.72, 1).toFixed(2),
    };
  },
  // No respawn keys, and no re-rolled node: --delay encodes this cell's distance to the centre and
  // animation-delay cannot be changed once the animation is running (see the header).
  css: `
/* Lattice step, per surface. Both the mask tile and particle() derive from it (see S_CARD/S_COMPACT
   — keep the two in step). */
.card-fx-hextech {
  --hex-s: ${S_CARD}px;
  --hex-reach: ${reachSize(S_CARD, COLS.card, ROWS.card).toFixed(0)}px;
}
.card-fx-hextech.compact {
  --hex-s: ${S_COMPACT}px;
  --hex-reach: ${reachSize(S_COMPACT, COLS.compact, ROWS.compact).toFixed(0)}px;
}
/* THE ETCHING and THE CHARGE share one mask, and \`center\` is load-bearing: it puts a lattice node
   exactly at the container's centre, which is the anchor every cell is placed from. */
.card-fx-hextech::before,
.card-fx-hextech::after {
  content: '';
  position: absolute;
  inset: 0;
  -webkit-mask-image: ${lattice(1.15)};
  mask-image: ${lattice(1.15)};
  -webkit-mask-size: calc(var(--hex-s) * 3) calc(var(--hex-s) * 1.732);
  mask-size: calc(var(--hex-s) * 3) calc(var(--hex-s) * 1.732);
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: repeat;
  mask-repeat: repeat;
}
/* A pill renders the tile at ~half size; drawn thicker so the line keeps its apparent weight. */
.card-fx-hextech.compact::before,
.card-fx-hextech.compact::after {
  -webkit-mask-image: ${lattice(1.8)};
  mask-image: ${lattice(1.8)};
}
/* The etching: dim, because it is the thing the light happens ON, not the effect itself. The static
   opacity is the floor the breath swings around — and what's left when animations are off. */
.card-fx-hextech::before {
  background: linear-gradient(
    165deg,
    color-mix(in srgb, var(--cos-fx-tint, #6fd8ff) 42%, transparent),
    color-mix(in srgb, var(--cos-fx-tint, #6fd8ff) 14%, transparent)
  );
  opacity: 0.3;
  animation: cardfx-hex-breath ${WAVE}s ease-in-out infinite;
}
/* THE WAVE — a ring that grows out of the centre. Only the gradient's own BACKGROUND-SIZE changes; the
   element and its mask never move, so the light spreads along the lattice instead of a lit shape
   sliding over it.
   THE BOX MUST BE SQUARE, AND IN PIXELS. Sized in %, the gradient's box takes the CARD's proportions —
   wide and short — and a circle in such a box is cropped top and bottom by the box itself, leaving the
   two side arcs to grow apart like a pair of expanding blocks. A square box in px is round at every
   size, and it puts the ring on the same px ruler as the cells (see BAND / reachSize), which is what
   makes the flashes land under the front rather than near it. */
.card-fx-hextech::after {
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
  /* linear, deliberately: the stops below already ARE the motion, and any easing here would slide the
     ring off the cells, whose delays assume it crosses the card at a steady rate. */
  animation: cardfx-hex-wave ${WAVE}s linear infinite;
}
/* One breath: a spark gathers at the centre (in), the ring swells outward and thins as it goes (out),
   then nothing at all. The silence in the last quarter is not dead time — it is what makes the next
   breath an event rather than a metronome. */
@keyframes cardfx-hex-wave {
  0% {
    background-size: calc(var(--hex-reach) * 0.02) calc(var(--hex-reach) * 0.02);
    opacity: 0;
  }
  /* the charge gathers */
  7% {
    background-size: calc(var(--hex-reach) * 0.035) calc(var(--hex-reach) * 0.035);
    opacity: 1;
  }
  /* and leaves (BORN) */
  10% {
    background-size: calc(var(--hex-reach) * 0.05) calc(var(--hex-reach) * 0.05);
    opacity: 1;
  }
  /* crossing at a steady rate, arriving on the outermost node exactly here (REACH) */
  58% {
    background-size: var(--hex-reach) var(--hex-reach);
    opacity: 0.5;
  }
  /* past the last node, still spreading at the same rate, dissipating as it leaves */
  78%,
  100% {
    background-size: calc(var(--hex-reach) * 1.4) calc(var(--hex-reach) * 1.4);
    opacity: 0;
  }
}
/* The lattice swells with the intake and settles as the ring leaves — the breath you feel rather than
   watch. Small numbers on purpose: the etching brightening is a mood, not a second effect. */
@keyframes cardfx-hex-breath {
  0%,
  100% {
    opacity: 0.26;
  }
  8% {
    opacity: 0.44;
  }
  58% {
    opacity: 0.3;
  }
}
/* THE CELL — a hexagon sitting exactly on a node: 50%/50% is the anchored centre, --dx/--dy step out
   in whole lattice periods, and the negative margins put its own centre on that node. */
.card-fx-hextech .p {
  width: calc(var(--hex-s) * 2);
  height: calc(var(--hex-s) * 1.732);
  margin-left: calc(var(--dx, 0px) - var(--hex-s));
  margin-top: calc(var(--dy, 0px) - var(--hex-s) * 0.866);
  clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
  background: radial-gradient(
    circle at 50% 50%,
    #fff 0 14%,
    var(--cos-fx-tint, #6fd8ff) 46%,
    color-mix(in srgb, var(--cos-fx-tint, #6fd8ff) 25%, transparent) 100%
  );
  animation: cardfx-hex-cell ${WAVE}s ease-in-out var(--delay, 0s) infinite;
}
/* Charge, DISCHARGE, afterglow — with the discharge pinned to FLASH (50%), the instant the ring
   arrives. The stumble right after it is the discharge itself: without that drop the cell just fades
   up and down and reads as a pulsing light rather than as something firing. Amplitude comes from
   --peak, since the timing belongs to the wave (see particle()). */
@keyframes cardfx-hex-cell {
  0%,
  20% {
    opacity: 0;
    filter: brightness(0.6);
  }
  /* the front is close; the node starts drawing charge */
  42% {
    opacity: calc(var(--peak, 1) * 0.3);
    filter: brightness(0.8);
  }
  50% {
    opacity: calc(var(--peak, 1) * 0.95);
    filter: brightness(2.2);
  }
  56% {
    opacity: calc(var(--peak, 1) * 0.18);
  }
  62% {
    opacity: calc(var(--peak, 1) * 0.6);
    filter: brightness(1.6);
  }
  80%,
  100% {
    opacity: 0;
    filter: brightness(0.6);
  }
}
`,
};
