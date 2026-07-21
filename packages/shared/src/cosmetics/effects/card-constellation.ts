import type { CardEffectModule } from '../types';

/**
 * A slow, living night sky: a faint field of stars twinkling across the whole card, with a handful of
 * real asterisms that DRAW THEMSELVES ON — the line flying out from a bright anchor star and reaching
 * each next star in turn — then holding, drifting, turning, and fading to make way for a new one.
 *
 * WHY SHAPES ARE CURATED, NOT RANDOM. Earlier versions scattered points at random and chained them
 * (nearest-neighbour, or generation order). Both fail the same way: a handful of uniformly-random
 * points has no reason to form a pleasing figure, so the "constellation" kept collapsing toward a
 * near-straight line at unnatural angles. This takes card-runes' lesson — lean on real structure
 * instead of inventing one per particle — and ships a small library of hand-tuned asterisms (a
 * Cassiopeia W, a ladle, an S-curve, a hook, a checkmark, an arc). Each is a good 2D open polyline by
 * construction; per particle it's randomly rotated, mirrored and lightly jittered, so one template is
 * never twice the same yet never degenerates.
 *
 * TWO INDEPENDENT LAYERS make it read as sky rather than "sticks floating in a void":
 *
 *  - THE BACKGROUND FIELD lives on the LAYER'S OWN pseudo-elements (`.card-fx-constellation::before`
 *    / `::after`) — the per-cluster particles are `.p` CHILDREN, so the layer's own two pseudos are
 *    free. A tiling `radial-gradient` starfield (one star per tile, several co-prime tile sizes so the
 *    grid never reads as a grid), resolution-independent so it fills a 40px chat pill and a full-stage
 *    alert alike. `::before` is far, dense, dim dust; `::after` the nearer, brighter, twinkling stars.
 *    They drift opposite ways at different speeds (parallax = depth) and pulse in anti-phase, so the
 *    field shimmers as a whole instead of blinking on and off in unison.
 *
 *  - THE ASTERISMS are the `.p` particles: stars on `::before`, the connecting line on `::after`.
 *
 * HOW THE LINE DRAWS ITSELF. The line is one `clip-path` ribbon through the stars (a polyline offset
 * to a thin closed strip — card-lightning's trick, generalized to arbitrary points). To animate the
 * draw we pre-compute, per particle, a fixed number of ribbon STATES: state s has segments 0..s at
 * their real length and every later point COLLAPSED onto point s. Every state is a polygon with the
 * SAME vertex count, so CSS interpolates cleanly between consecutive states — and because the collapsed
 * far end sits on point s until it's this segment's turn, then travels out to the next star, the
 * in-between frames look exactly like the line reaching from one star to the next. The draw runs over
 * the fade-in of the same cycle, on `::after`, at the same `--dur`/`--delay` as the particle, so it
 * stays phase-locked to the life cycle without a second animation on `.p` (bindRespawn fires on `.p`'s
 * `animationiteration`; a pseudo's is ignored, so the draw is free to live on `::after`).
 *
 * THE STARS render as one element's `box-shadow` list — a bright core plus a soft blue glow per point,
 * each sized by its shadow's SPREAD radius (not blur: a shadow of a zero-area box with only blur casts
 * nothing). Brightness varies star to star (stellar magnitude), the anchor brightest — that spread is
 * what reads as depth within a cluster.
 *
 * WHOLE-SKY MOTION. Real stars don't fly around; they hold their positions and the whole sky slowly
 * wheels as the viewpoint turns. So a finished figure gets NO random path of its own — every particle
 * shares ONE slow pan + rotation (the `--sky-*` values on `.p`, identical for all), and both pseudos
 * ride the `.p` anchor with no transform of their own, so stars and line move together as a rigid
 * body. The trick that makes independent, out-of-phase particles read as a single coherent sky is
 * CONSTANT VELOCITY: the life keyframe glides linearly from -sweep to +sweep (position and angle) with
 * `linear` timing, and a constant velocity is the same at every phase — so two particles at different
 * `--delay` offsets are nonetheless moving at the same rate in the same direction at every instant.
 * The only discontinuity, the -sweep↔+sweep snap at the loop point, sits exactly where opacity is 0,
 * the same true-0 boundary that also hides the respawn's reroll of template/orientation/spot — the
 * invariant every falling/rising effect in this catalog relies on.
 */

/** Hand-tuned asterisms as open polylines in normalized [-1, 1] space (x right, y down). Chosen to
 *  read as star figures with clear 2D turns — never a straight line, never a degenerate angle. */
const TEMPLATES: number[][][] = [
  // Cassiopeia's W.
  [
    [-1.0, 0.35],
    [-0.5, -0.4],
    [0.0, 0.2],
    [0.5, -0.45],
    [1.0, 0.15],
  ],
  // A ladle: shallow bowl into a raised handle.
  [
    [-0.9, -0.4],
    [-0.5, 0.25],
    [0.05, 0.3],
    [0.3, -0.25],
    [0.85, -0.5],
  ],
  // A flowing S-curve.
  [
    [-1.0, 0.35],
    [-0.45, -0.05],
    [0.0, 0.2],
    [0.5, -0.3],
    [0.95, 0.05],
  ],
  // A hook / curl.
  [
    [-0.8, -0.35],
    [0.05, -0.5],
    [0.6, -0.05],
    [0.35, 0.5],
    [-0.2, 0.55],
  ],
  // A checkmark (4 stars).
  [
    [-0.9, -0.15],
    [-0.2, 0.5],
    [0.35, -0.15],
    [0.9, 0.5],
  ],
  // A gentle arc.
  [
    [-0.95, 0.1],
    [-0.5, -0.4],
    [0.05, -0.55],
    [0.55, -0.35],
    [0.95, 0.1],
  ],
];

// Every template is padded to this many points so the ribbon always has the same vertex count — the
// precondition for CSS to interpolate the draw states (see header).
const MAX_PTS = 5;

export const cardConstellation: CardEffectModule = {
  id: 'card-constellation',
  type: 'card_effect',
  costDust: 3500,
  className: 'card-fx-constellation',
  // Each particle is a whole asterism, not a single star — the background field carries the rest of
  // the sky, so a few well-drawn figures is the right density here, not a swarm.
  counts: { web: 4, overlayCard: 3, overlayChat: 2 },
  labels: { name: 'shop.cardConstellation', desc: 'shop.cardConstellationDesc' },
  particle: (rnd, compact) => {
    // Half-size of the cluster in px — small-decoration scale, not card-proportional (see the note on
    // fixed px in CardEffectModule.particle). Normalized template coords span roughly [-1, 1] * spread.
    const spread = compact ? 10 : 26;

    const tpl = TEMPLATES[Math.floor(rnd(0, TEMPLATES.length - 0.0001))]!;
    const realCount = tpl.length;

    // Random orientation + mirror + a light jitter: one template, never twice identical, never
    // degenerate. Rotating the whole figure (not just the animated sway) keeps every W from pointing
    // the same way.
    const theta = rnd(0, Math.PI * 2);
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const mirror = rnd(0, 1) < 0.5 ? -1 : 1;
    const jit = 0.07;
    const pts = tpl.map(([nx0, ny0]) => {
      const jx = nx0! * mirror + rnd(-jit, jit);
      const jy = ny0! + rnd(-jit, jit);
      return { x: (jx * cos - jy * sin) * spread, y: (jx * sin + jy * cos) * spread };
    });
    // Pad to MAX_PTS by repeating the last star — keeps the ribbon's vertex count constant across
    // templates (the trailing zero-length segments cast no ribbon and draw no star).
    while (pts.length < MAX_PTS) pts.push({ ...pts[pts.length - 1]! });

    // Stars: box-shadows on a 2px base dot (see css), each sized by SPREAD (a 0x0 base + blur alone
    // casts nothing). Cores on top, glows behind; only the REAL points (not the padding) get a star,
    // and the anchor (index 0) is brightest and biggest — one prominent star with fainter company.
    const cores: string[] = [];
    const glows: string[] = [];
    for (let i = 0; i < realCount; i++) {
      const p = pts[i]!;
      const anchor = i === 0;
      const r = anchor ? (compact ? 2.0 : 2.5) : rnd(0.85, 1.4);
      const m = anchor ? 1 : rnd(0.4, 0.75);
      const xy = `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`;
      cores.push(`${xy} ${(r * 0.5).toFixed(1)}px ${(r - 1).toFixed(2)}px rgba(255,255,255,${m.toFixed(2)})`);
      glows.push(`${xy} ${(r * 2.8).toFixed(1)}px ${(r * 0.4).toFixed(2)}px rgba(188,217,255,${(0.5 * m).toFixed(2)})`);
    }
    const shadows = [...cores, ...glows];

    // The ribbon: offset each segment perpendicular to its own direction by a half-width, trace all
    // the "left" offsets forward then all the "right" offsets back — a polyline turned into a thin
    // closed strip, with a real per-segment normal.
    const halfW = 0.5;
    const pad = 2;
    // Rotation can push a normalized corner out to ~1.25 * spread; give the containing box that reach
    // plus a little, so no orientation ever clips the figure at the box edge.
    const reach = spread * 1.3;
    const box = reach * 2 + pad * 2;
    const toPx = (v: number) => v + reach + pad;
    const ribbon = (seq: { x: number; y: number }[]): string => {
      const left: string[] = [];
      const right: string[] = [];
      for (let i = 0; i < seq.length - 1; i++) {
        const a = seq[i]!;
        const b = seq[i + 1]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = (-dy / len) * halfW;
        const ny = (dx / len) * halfW;
        left.push(`${toPx(a.x + nx).toFixed(1)}px ${toPx(a.y + ny).toFixed(1)}px`);
        left.push(`${toPx(b.x + nx).toFixed(1)}px ${toPx(b.y + ny).toFixed(1)}px`);
        right.push(`${toPx(a.x - nx).toFixed(1)}px ${toPx(a.y - ny).toFixed(1)}px`);
        right.push(`${toPx(b.x - nx).toFixed(1)}px ${toPx(b.y - ny).toFixed(1)}px`);
      }
      right.reverse();
      return `polygon(${[...left, ...right].join(', ')})`;
    };

    // The draw states: state s has points past s collapsed onto point s, so the visible ribbon spans
    // only segments 0..s. Same vertex count in every state, which is what lets CSS interpolate the
    // reach from one star to the next (see header). State 0 is fully collapsed = nothing drawn yet.
    const draws: Record<string, string> = {};
    for (let s = 0; s < MAX_PTS; s++) {
      const frontier = pts[s]!;
      draws[`--d${s}`] = ribbon(pts.map((p, idx) => (idx <= s ? p : frontier)));
    }

    // NOTE the motion of a finished figure is NOT emitted here — it is a single shared slow pan +
    // rotation (constant velocity, identical for every particle), declared once in css. That is what
    // makes the sky read as one coherent thing wheeling, rather than each figure flying its own random
    // path. See the header ("WHOLE-SKY MOTION") for why constant velocity is what lets independent,
    // out-of-phase particles still move as a rigid body.
    const dur = compact ? rnd(11, 15) : rnd(13, 18);
    const shimmerDur = rnd(2.4, 4.2);
    return {
      left: `${rnd(compact ? 14 : 16, compact ? 86 : 84).toFixed(1)}%`,
      top: `${rnd(16, 80).toFixed(1)}%`,
      '--shadows': shadows.join(', '),
      '--box': `${box}px`,
      ...draws,
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
      '--shimmer-dur': `${shimmerDur.toFixed(2)}s`,
    };
  },
  // Everything reforms on respawn: a new template, orientation, star field AND the whole draw sequence
  // — all timed to land while opacity is at true 0 (see the header). The MOTION is not rerolled: it's
  // shared and constant, so there is nothing per-particle to refresh.
  respawnKeys: ['top', '--shadows', '--box', '--d0', '--d1', '--d2', '--d3', '--d4', '--shimmer-dur'],
  // No groundGlow: a cluster drifts through open space — nothing rises from or lands on the bottom
  // edge for a bloom to mark.
  css: `
/* THE NEBULA — a faint deep-space bloom on the layer's OWN background, behind the starfield pseudos
   and the asterisms: the dark between stars given some colour and depth. On the layer element itself,
   NOT a pseudo — both pseudos are taken by the field; the element's own background sits below them.
   Because it's on the element it is clipped EXACTLY at the card (unlike the inset:-20% pseudos, whose
   overflow hides off-frame), so every bloom must reach transparent BEFORE the edges — a bloom still
   bright where the card ends gets sliced off in a hard straight line (the bottom one used to). Hence
   the centres sit inland and the fade completes with margin to spare for the drift.
   It drifts only via background-POSITION: a transform or opacity on the layer would drag the pseudo
   children it parents, but background-position repaints just the element's own background. And the
   drift is in PX, not %: a background sized to its box ignores percentage positioning (the % is of
   box-minus-image, which is zero here), so only a length actually moves it. */
.card-fx-constellation {
  background:
    radial-gradient(48% 42% at 32% 34%, rgba(99, 102, 241, 0.11), transparent 62%),
    radial-gradient(46% 42% at 70% 58%, rgba(56, 120, 200, 0.1), transparent 64%),
    radial-gradient(44% 40% at 50% 68%, rgba(126, 92, 208, 0.08), transparent 60%);
  background-repeat: no-repeat;
  animation: cardfx-constellation-nebula 54s ease-in-out infinite;
}
/* A very slow churn, each bloom drifting its own way — the gas turning, not translating anywhere.
   Kept small (±5px) so the fade never drifts out past an edge and re-opens the clipping. */
@keyframes cardfx-constellation-nebula {
  0%,
  100% {
    background-position: 0 0, 0 0, 0 0;
  }
  50% {
    background-position: 5px 4px, -5px 3px, 4px -5px;
  }
}
/* THE BACKGROUND FIELD — a tiling starfield on the layer's own pseudo-elements (the .p particles are
   children, so ::before/::after here are free). Resolution-independent, fills any surface. Two
   parallax planes drifting opposite ways and pulsing in anti-phase; oversized past the layer's edges
   so the drift never exposes a seam (the layer clips to the card). */
.card-fx-constellation::before,
.card-fx-constellation::after {
  content: '';
  position: absolute;
  inset: -20%;
  pointer-events: none;
  background-repeat: repeat;
}
/* Far plane: dense, dim, small dust. Steadier and slower than the near stars. */
.card-fx-constellation::before {
  background-image:
    radial-gradient(1px 1px at 30px 40px, rgba(197, 227, 255, 0.9), transparent),
    radial-gradient(1px 1px at 100px 75px, rgba(255, 255, 255, 0.85), transparent),
    radial-gradient(1px 1px at 160px 130px, rgba(188, 217, 255, 0.8), transparent),
    radial-gradient(1px 1px at 70px 170px, rgba(255, 255, 255, 0.75), transparent);
  background-size: 190px 190px, 170px 170px, 230px 230px, 150px 150px;
  animation: cardfx-constellation-far 26s ease-in-out infinite;
}
/* Near plane: sparser, bigger, brighter — these are the ones that twinkle. */
.card-fx-constellation::after {
  background-image:
    radial-gradient(1.6px 1.6px at 40px 30px, #ffffff, transparent),
    radial-gradient(1.4px 1.4px at 130px 95px, rgba(207, 227, 255, 0.95), transparent),
    radial-gradient(1.5px 1.5px at 80px 160px, #ffffff, transparent);
  background-size: 240px 240px, 300px 300px, 270px 270px;
  animation: cardfx-constellation-near 19s ease-in-out infinite;
}
/* A short container (chat pill / leaderboard row) gets a fainter field so the hero asterisms read. */
.card-fx-constellation.compact::before {
  opacity: 0.5;
}
.card-fx-constellation.compact::after {
  opacity: 0.6;
}
@keyframes cardfx-constellation-far {
  0%,
  100% {
    translate: -7px -4px;
    opacity: 0.28;
  }
  50% {
    translate: 7px 4px;
    opacity: 0.42;
  }
}
@keyframes cardfx-constellation-near {
  0%,
  100% {
    translate: 6px 5px;
    opacity: 0.9;
  }
  50% {
    translate: -6px -5px;
    opacity: 0.5;
  }
}

/* THE ASTERISMS — each a .p particle carrying its stars (::before) and its self-drawing line (::after).
   The whole-sky motion (--sky-*) is declared HERE, once, identical for every particle, NOT emitted per
   particle: one shared pan + turn is what makes the field wheel as a single coherent thing instead of
   each figure flying its own random path. LINEAR timing is load-bearing — a constant velocity is the
   same at every phase, so even though particles run at random --delay offsets they all move at the
   same rate at every instant (a rigid body), and the loop's snap-back is hidden at opacity 0. */
.card-fx-constellation .p {
  top: 0;
  width: 0;
  height: 0;
  --sky-dx: 11px;
  --sky-dy: -6px;
  --sky-spin: 9deg;
  animation: cardfx-constellation-life var(--dur, 15s) linear var(--delay, 0s) infinite;
}
/* A short container gets a smaller sweep so the motion stays a whisper, not a lurch. */
.card-fx-constellation.compact .p {
  --sky-dx: 6px;
  --sky-dy: -4px;
  --sky-spin: 6deg;
}
/* The stars: one box-shadow layer pair (soft glow + bright core) per point, no extra DOM per star.
   The 2px base dot is centered on the anchor and stays transparent — box-shadow SPREAD sizes each
   star (a 0x0 base would cast nothing). */
.card-fx-constellation .p::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  height: 2px;
  margin: -1px 0 0 -1px;
  border-radius: 50%;
  box-shadow: var(--shadows, none);
  animation: cardfx-constellation-shimmer var(--shimmer-dur, 3.2s) ease-in-out infinite;
}
/* The connecting line: a box framing the cluster's local space, centered on the anchor, clipped to
   the ribbon. clip-path animates through the draw states so the line reaches star to star; its base
   value is the FULL figure, so with animation off (reduced motion) the constellation still shows. */
.card-fx-constellation .p::after {
  content: '';
  position: absolute;
  top: calc(var(--box, 70px) / -2);
  left: calc(var(--box, 70px) / -2);
  width: var(--box, 70px);
  height: var(--box, 70px);
  background: rgba(200, 224, 255, 0.5);
  clip-path: var(--d4, none);
  animation: cardfx-constellation-draw var(--dur, 14s) ease-in-out var(--delay, 0s) infinite;
}
/* One steady glide from -sweep to +sweep across the whole cycle (position AND angle), so the velocity
   is constant — the property that keeps out-of-phase particles moving as one rigid sky (see the .p
   rule). Opacity opens and closes at true 0, which both hides the respawn's reroll of template/spot
   and covers the -sweep→+sweep snap at the loop point. translate + rotate are independent transform
   properties, so both ride this ONE keyframe on .p (a second animation on .p would double-fire the
   respawn — see the header). */
@keyframes cardfx-constellation-life {
  0% {
    opacity: 0;
    translate: calc(-1 * var(--sky-dx)) calc(-1 * var(--sky-dy));
    rotate: calc(-1 * var(--sky-spin));
  }
  9%,
  90% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    translate: var(--sky-dx) var(--sky-dy);
    rotate: var(--sky-spin);
  }
}
/* The self-drawing line: from nothing (all points collapsed on the anchor) it reaches out one star at
   a time over the fade-in, then holds the full figure for the rest of the cycle. Same --dur/--delay
   as the particle, so it's phase-locked to the life cycle above; it snaps back to --d0 at the loop
   point while opacity is already 0. */
@keyframes cardfx-constellation-draw {
  0%,
  6% {
    clip-path: var(--d0, none);
  }
  13% {
    clip-path: var(--d1, none);
  }
  20% {
    clip-path: var(--d2, none);
  }
  27% {
    clip-path: var(--d3, none);
  }
  34%,
  100% {
    clip-path: var(--d4, none);
  }
}
/* A gentle shared brightness pulse across the whole cluster — independent of the life cycle, so the
   stars keep some shimmer even while the cluster is mid-drift, not just at its edges. */
@keyframes cardfx-constellation-shimmer {
  0%,
  100% {
    filter: brightness(1);
  }
  50% {
    filter: brightness(1.45);
  }
}
`,
};
