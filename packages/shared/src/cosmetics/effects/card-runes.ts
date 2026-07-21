import type { CardEffectModule } from '../types';

/**
 * A small arcane glyph manifests somewhere on the card, glows, holds, and dissolves — a handful of
 * these cycling independently and out of phase so 1-3 are usually lit at once.
 *
 * WHY AUTHORED, NOT RANDOM. An earlier version generated the glyph procedurally — a vertical stave
 * with random branches. It read as needles on a stick, not as writing, because random branch angles
 * and counts have no reason to spell anything. This ships a small library of REAL Elder Futhark runes
 * instead (Fehu, Ansuz, Raido, Kaunan, Gebo, Wunjo, Hagalaz, Sowilo, Tiwaz, Algiz, Thurisaz, Uruz):
 * each is a crisp, recognisable letter, and the variety comes from picking one and giving it a slight
 * tilt/scale rather than from mangling its strokes (jitter would just make a rune illegible).
 *
 * HOW ARBITRARY STROKES BECOME ONE clip-path. A rune is authored as a list of straight STROKES in a
 * normalized [-1, 1] box. Real runes are not all a connected stave-plus-branches — Gebo is a bare X,
 * Hagalaz two staves and a bar, Kaunan an open angle — so the shape genuinely has DISJOINT pieces,
 * which a single polygon normally can't express. `strokePolygon` gets around it the way card-lightning
 * bridges its spurs: each stroke becomes a thin quad, and the polygon hops between quads along a
 * bridge it walks OUT and straight back on the same line. An out-and-back bridge encloses zero area,
 * so it adds no visible geometry and (crossing nothing net) leaves the nonzero fill of every quad
 * intact — one polygon, any number of disconnected strokes.
 *
 * Glow lives on `.p`, the SHAPE on `.p::before` — not the same element. card-lightning's header found
 * the reason the hard way: `clip-path` is applied after `filter`, so a glow and a clip on one element
 * crop the very halo the filter just drew, leaving a flat, glow-less line. Splitting them means the
 * clip only ever sees an unclipped, already-filtered box beneath it.
 *
 * No groundGlow: a rune appears where it appears and dissolves there — nothing rises from or lands on
 * the bottom edge for a bloom to mark, unlike every falling/rising effect in the catalog.
 */

/**
 * The runes, each a set of straight strokes [x1, y1, x2, y2] in a normalized [-1, 1] box (x right,
 * y down). Staved letters keep the stave at x ≈ -0.3 with branches to the right; the free-standing
 * ones (Gebo, Kaunan, Sowilo, Tiwaz, Algiz) are centred. Kept to strokes that read as the real letter.
 */
const RUNES: number[][][] = [
  // Fehu — stave + two up-tilted arms.
  [
    [-0.3, -0.9, -0.3, 0.9],
    [-0.3, -0.5, 0.36, -0.72],
    [-0.3, -0.14, 0.36, -0.36],
  ],
  // Uruz — tall left leg, sloped shoulder, shorter right leg.
  [
    [-0.32, -0.9, -0.32, 0.9],
    [-0.32, -0.9, 0.3, -0.44],
    [0.3, -0.44, 0.3, 0.9],
  ],
  // Thurisaz — stave + a triangle thorn at the middle.
  [
    [-0.3, -0.9, -0.3, 0.9],
    [-0.3, -0.28, 0.28, 0.02],
    [0.28, 0.02, -0.3, 0.32],
  ],
  // Ansuz — stave + two down-tilted branches.
  [
    [-0.3, -0.9, -0.3, 0.9],
    [-0.3, -0.62, 0.32, -0.32],
    [-0.3, -0.2, 0.32, 0.1],
  ],
  // Raido — stave + a top loop (as two strokes) + a kicking leg.
  [
    [-0.3, -0.9, -0.3, 0.9],
    [-0.3, -0.9, 0.3, -0.62],
    [0.3, -0.62, -0.3, -0.22],
    [-0.3, -0.22, 0.36, 0.56],
  ],
  // Kaunan — a bare open angle.
  [
    [0.28, -0.72, -0.26, 0.0],
    [-0.26, 0.0, 0.28, 0.72],
  ],
  // Gebo — an X.
  [
    [-0.4, -0.82, 0.4, 0.82],
    [0.4, -0.82, -0.4, 0.82],
  ],
  // Wunjo — stave + a pennant at the top.
  [
    [-0.3, -0.9, -0.3, 0.9],
    [-0.3, -0.9, 0.26, -0.54],
    [0.26, -0.54, -0.3, -0.18],
  ],
  // Hagalaz — two staves crossed by a slanted bar.
  [
    [-0.35, -0.9, -0.35, 0.9],
    [0.35, -0.9, 0.35, 0.9],
    [-0.35, -0.12, 0.35, 0.12],
  ],
  // Sowilo — a lightning zig-zag.
  [
    [0.3, -0.82, -0.18, -0.28],
    [-0.18, -0.28, 0.2, 0.14],
    [0.2, 0.14, -0.28, 0.7],
  ],
  // Tiwaz — an arrow: stave + upward chevron.
  [
    [0.0, -0.9, 0.0, 0.9],
    [0.0, -0.9, -0.34, -0.52],
    [0.0, -0.9, 0.34, -0.52],
  ],
  // Algiz — stave + a rising fork.
  [
    [0.0, -0.9, 0.0, 0.9],
    [0.0, -0.32, -0.4, -0.82],
    [0.0, -0.32, 0.4, -0.82],
  ],
];

// Half stroke width, normalized. The whole glyph is scaled by --sc on the element, so this is the
// stroke at scale 1; a real carved rune is a fairly even, chunky line, not a hairline.
const HALF_W = 0.11;

/** Build ONE clip-path polygon from a rune's strokes: each stroke a thin quad, all stitched together
 *  by zero-area out-and-back bridges from a shared anchor (see the header). */
function strokePolygon(strokes: number[][]): string {
  // Normalized [-1, 1] -> percent of the element box, with a 10% margin so strokes never touch the edge.
  const toPct = (v: number) => (50 + v * 40).toFixed(2);
  const out: string[] = [];
  const pt = (x: number, y: number) => out.push(`${toPct(x)}% ${toPct(y)}%`);
  let ax = 0;
  let ay = 0;
  strokes.forEach(([x1, y1, x2, y2], i) => {
    const dx = x2! - x1!;
    const dy = y2! - y1!;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * HALF_W;
    const ny = (dx / len) * HALF_W;
    if (i === 0) {
      ax = x1! + nx;
      ay = y1! + ny;
    }
    // Bridge from the anchor to this quad, trace the quad, bridge straight back to the anchor.
    pt(ax, ay);
    pt(x1! + nx, y1! + ny);
    pt(x2! + nx, y2! + ny);
    pt(x2! - nx, y2! - ny);
    pt(x1! - nx, y1! - ny);
    pt(x1! + nx, y1! + ny);
    pt(ax, ay);
  });
  return `polygon(${out.join(', ')})`;
}

export const cardRunes: CardEffectModule = {
  id: 'card-runes',
  type: 'card_effect',
  costDust: 3500,
  className: 'card-fx-runes',
  counts: { web: 5, overlayCard: 5, overlayChat: 4 },
  labels: { name: 'shop.cardRunes', desc: 'shop.cardRunesDesc' },
  particle: (rnd, compact) => {
    const rune = RUNES[Math.floor(rnd(0, RUNES.length - 0.0001))]!;
    const dur = compact ? rnd(3.3, 5) : rnd(3.6, 5.6);
    return {
      left: `${rnd(12, 88).toFixed(1)}%`,
      top: `${rnd(15, 82).toFixed(1)}%`,
      '--rune': strokePolygon(rune),
      // A slight tilt for life, but small — a rune leans, it doesn't tumble.
      '--rot': `${rnd(-6, 6).toFixed(1)}deg`,
      '--sc': (compact ? rnd(0.55, 0.75) : rnd(0.85, 1.15)).toFixed(2),
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // A new rune, spot and tilt each cycle — reborn at opacity 0 (see the manifest keyframe), the same
  // invariant every respawn in this catalog relies on.
  respawnKeys: ['top', '--rune', '--rot', '--sc'],
  css: `
/* THE ATMOSPHERE — a faint arcane haze on the layer's own pseudo-elements (the runes are .p children,
   so ::before/::after here are free), so the card between manifestations isn't dead space. Violet to
   match the glyph glow; ::before drifting mist, ::after a field of tiny rising motes (tiling, so it
   fills any surface). Faint by design — mood, not subject. */
.card-fx-runes::before,
.card-fx-runes::after {
  content: '';
  position: absolute;
  inset: -20%;
  pointer-events: none;
}
.card-fx-runes::before {
  background:
    radial-gradient(42% 55% at 28% 38%, rgba(167, 139, 250, 0.08), transparent 70%),
    radial-gradient(46% 50% at 70% 66%, rgba(124, 58, 237, 0.06), transparent 70%),
    radial-gradient(38% 46% at 55% 20%, rgba(199, 168, 255, 0.05), transparent 70%);
  animation: cardfx-runes-haze 26s ease-in-out infinite;
}
.card-fx-runes::after {
  background-image:
    radial-gradient(1px 1px at 25px 35px, rgba(216, 199, 255, 0.7), transparent),
    radial-gradient(1px 1px at 95px 80px, rgba(180, 150, 245, 0.6), transparent),
    radial-gradient(1.3px 1.3px at 150px 50px, rgba(216, 199, 255, 0.5), transparent),
    radial-gradient(1px 1px at 60px 130px, rgba(190, 165, 250, 0.55), transparent);
  background-size: 175px 175px, 205px 205px, 140px 140px, 195px 195px;
  animation: cardfx-runes-motes 17s ease-in-out infinite;
}
.card-fx-runes.compact::before {
  opacity: 0.6;
}
@keyframes cardfx-runes-haze {
  0%,
  100% {
    transform: translate(-3%, -2%) scale(1);
    opacity: 0.8;
  }
  50% {
    transform: translate(3%, 2%) scale(1.09);
    opacity: 1;
  }
}
@keyframes cardfx-runes-motes {
  0%,
  100% {
    transform: translateY(7px);
    opacity: 0.5;
  }
  50% {
    transform: translateY(-7px);
    opacity: 0.95;
  }
}

.card-fx-runes .p {
  top: 0;
  width: 34px;
  height: 34px;
  margin: -17px 0 0 -17px;
  scale: var(--sc, 1);
  rotate: var(--rot, 0deg);
  filter: drop-shadow(0 0 3px #a78bfa) drop-shadow(0 0 7px #7c3aed);
  animation: cardfx-rune-manifest var(--dur, 4.6s) ease-in-out var(--delay, 0s) infinite;
}
.card-fx-runes .p::before {
  content: '';
  position: absolute;
  inset: 0;
  background: #c7a8ff;
  clip-path: var(--rune, none);
}
@keyframes cardfx-rune-manifest {
  0%,
  100% {
    opacity: 0;
  }
  18% {
    opacity: 0.85;
  }
  70% {
    opacity: 0.85;
  }
  92% {
    opacity: 0;
  }
}
`,
};
