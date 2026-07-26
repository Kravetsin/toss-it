import type { SealModule } from '../types';

/**
 * The Supernova: the SUBMISSIONS seal — the site's own spark is what a submission is worth, so the
 * sender's mark is that spark, and what circles it is what it threw off.
 *
 * The shockwave is GONE. It was a drawn circle, the only piece of pure geometry in the set, and
 * nothing could interact with it: whatever phase the star's light was given, the ring either flashed
 * over a wave that had not travelled or peaked over one that had already dissolved. Orbiting matter
 * has the life the ring never had — the same reason the core, the black hole, the hourglass and the
 * swarm are all built out of moving marks.
 *
 * ONE plane, not two. A crossed pair was tried first and failed for a reason worth keeping written
 * down: two orbits of the same width and depth differ only by their tilt, and sparse marks give the
 * eye nothing to trace, so the pair reads as one cloud rather than as two rings. Making each ring
 * dense enough to be traceable is the fix, and it is unaffordable — this seal lives at 15px in the
 * chat gutter, where two dozen marks turn to mush.
 *
 * REAL ORBITAL DEPTH, which SVG cannot do directly: paint order is document order, so one node cannot
 * move behind the star mid-lap. So the ring is drawn TWICE — one copy before the star, one after —
 * and each copy is visible for exactly the half of the lap where it belongs. The handoff happens at
 * the ellipse's left and right vertices, where both copies sit at the same point, so it is invisible.
 * This is the hourglass's ring and the black hole's orbit; the shared keyframes are what make it cheap
 * to give the far half a smaller scale and a lower opacity, which is the cue that sells the tilt.
 *
 * The star is inner markup rather than a masked pseudo-element now, because layer order IS the depth
 * here and a pseudo-element cannot be sandwiched between two halves of a ring. Its shading is a
 * radial gradient whose stops are coloured from CSS, so `--seal-tint` still repaints the whole thing.
 *
 * Two rungs plus an earned colour upgrade. The tier is the ring's DENSITY — 6 marks against 12 — the
 * core's ladder rule, and the one thing an orbit can honestly say "more" with.
 */

const CX = 12;
const CY = 12;

/** The spark: UNEVEN rays — the vertical pair spans the full height, the horizontal pair stops at
 *  3.4/20.6. The asymmetry is what stops it reading as a symmetric little cross, and it is what
 *  survives 14px, where the long axis is the last thing left. */
const SPARK =
  'M12 0 C12 8.4 9.8 11.2 3.4 12 C9.8 12.8 12 15.6 12 24 C12 15.6 14.2 12.8 20.6 12 C14.2 11.2 12 8.4 12 0 Z';

/** The star's own beat: brightest at 0%, then it dims — it spends itself. The pulse is in LIGHT, not
 *  in size: the ray tips sit on the edge of the box, so resizing the spark moved four points at once
 *  and read as a twitch at 15px. The cold rung runs the same pulse, slower. */
const PULSE = 2.8;
const PULSE_COLD = 5.2;

/** The orbit. Wide and shallow — seen from slightly above, then tilted per plane in the markup. */
const RX = 9.9;
const RY = 3.1;
/** Orbit samples. At 15° the chord sits under 1% off the true ellipse — the figure the black hole and
 *  the hourglass both settled on. */
const STEPS = 24;
/** The plane's tilt. Steeper than the hourglass's -18°, which is most of what stops the two rings
 *  reading as the same relic on a different seal. */
const TILT = -34;
/** One lap. Marks share it and are spread around the ring by negative delays. */
const LAP = 8.4;
/** The FULL ring. The lower rung renders every other mark of this same list, so a mark keeps its class
 *  — and therefore its phase and its resting position — across both rungs. ROUND dots, not the
 *  hourglass's radial shards: a sliver aimed at the centre fights the spark's own rays. */
const MARKS = 12;
/** Every third mark is bigger and white — the hotspot convention of the set, and an even ring of
 *  identical dots reads as a loading spinner. Thirds against halves is also what keeps the lower rung
 *  from inheriting an all-big or all-small ring. */
const DOT = { big: 0.72, small: 0.5 };

/** Where a mark sits on its plane at a point of the lap, and how near it is (0 far, 1 near). */
function at(p: number) {
  const th = p * Math.PI * 2;
  return {
    x: CX + RX * Math.cos(th),
    y: CY + RY * Math.sin(th),
    near: Math.sin(th) > 0,
    depth: (Math.sin(th) + 1) / 2,
  };
}

const scaleAt = (depth: number) => 0.66 + depth * 0.62;
const opacityAt = (depth: number) => 0.4 + depth * 0.6;

/** One copy of a plane's lap: the far half is drawn at opacity 0 so the other copy carries it. */
function orbitFrames(name: string, front: boolean): string {
  let out = `@keyframes ${name} {\n`;
  for (let i = 0; i <= STEPS; i++) {
    const p = i / STEPS;
    const { x, y, near, depth } = at(p);
    const opacity = near === front ? opacityAt(depth).toFixed(2) : '0';
    out +=
      `  ${(p * 100).toFixed(2)}% { transform: translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) ` +
      `scale(${scaleAt(depth).toFixed(2)}); opacity: ${opacity}; }\n`;
  }
  return `${out}}\n`;
}

const ORBIT_CSS = `${orbitFrames('seal-nova-front', true)}${orbitFrames('seal-nova-back', false)}`;

/**
 * Marks carry no cx/cy — the keyframes place them — so with the animation off they would all pile
 * onto the 0% point and the orbit would collapse to a dot. Each mark gets a resting spot for its own
 * phase instead, and only the copy on the right side of the lap is shown, which paints the same two
 * rings standing still.
 */
const STILL_CSS = `@media (prefers-reduced-motion: reduce) {
${Array.from({ length: MARKS }, (_, i) => {
  const { x, y, near, depth } = at(i / MARKS);
  return (
    `  .seal-fx .nv-p${i} {\n` +
    `    transform: translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scaleAt(depth).toFixed(2)});\n` +
    `    opacity: 0;\n  }\n` +
    `  .seal-fx .nv-${near ? 'f' : 'b'}.nv-p${i} {\n    opacity: ${opacityAt(depth).toFixed(2)};\n  }`
  );
}).join('\n')}
}`;

/** Half of the ring. Each mark's delay is its place around the lap, so the two copies of the same mark
 *  stay welded and the marks stay evenly spread whichever rung renders them. */
const ring = (side: 'f' | 'b', dense: boolean) =>
  `<g transform="rotate(${TILT} ${CX} ${CY})">` +
  Array.from({ length: MARKS }, (_, i) => i)
    .filter((i) => dense || i % 2 === 0)
    .map((i) => {
      const big = i % 3 === 0;
      const delay = (-(i / MARKS) * LAP).toFixed(2);
      return (
        `<circle class="nv-m nv-${side} nv-p${i}${big ? ' nv-w' : ''}" ` +
        `r="${big ? DOT.big : DOT.small}" style="animation-delay:${delay}s"/>`
      );
    })
    .join('') +
  `</g>`;

/** Layer order IS the depth: far half, star, near half over the lot. The gradient id is per-rung
 *  because the shop shows the whole ladder at once and a duplicate id would resolve to the first. */
const svgFor = (dense: boolean, gid: string) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  `<defs><radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="${CX}" cy="${CY}" r="13">` +
  `<stop class="nv-hot" offset="0"/><stop class="nv-hot" offset="0.05"/>` +
  `<stop class="nv-cool" offset="0.34"/><stop class="nv-cool" offset="1"/>` +
  `</radialGradient></defs>` +
  ring('b', dense) +
  `<path class="nv-star" d="${SPARK}" fill="url(#${gid})"/>` +
  ring('f', dense) +
  `</svg>`;

/** Shared shell for both rungs; only the number of planes and the pace differ. */
function nova(rung: { id: string; count: number; className: string; lit: boolean }): SealModule {
  const c = rung.className;
  const gid = `seal-nova-g-${rung.lit ? 'hot' : 'cold'}`;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'submissions', count: rung.count },
    colorUpgrade: 'seal-nova-color',
    since: '2026-07-25',
    ladder: 'seal-nova',
    className: c,
    labels: { name: 'shop.sealNova', desc: 'shop.sealNovaDesc' },
    svg: svgFor(rung.lit, gid),
    css: `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names cannot collide with
   anything outside a seal. Emitted by each rung; the duplicate in the concatenated sheet is inert. */
.seal-fx .nv-star {
  transform-box: view-box;
  transform-origin: ${CX}px ${CY}px;
  animation: seal-nova-pulse ${PULSE}s ease-in-out infinite;
}
/* The gradient IS the shading — a hot white core bleeding into the tint — so the star is never the
   flat single fill that made the old ringed star look like cut paper. Stops are coloured from CSS
   rather than baked into the markup, which is what keeps --seal-tint able to repaint it. */
.seal-fx .nv-hot {
  stop-color: #ffffff;
}
.seal-fx .nv-cool {
  stop-color: var(--seal-tint, #8df0cc);
}
@keyframes seal-nova-pulse {
  0%, 100% {
    filter: brightness(1.38);
    transform: scale(1.02);
  }
  52% {
    filter: brightness(0.94);
    transform: scale(1);
  }
}
.seal-fx .nv-m {
  fill: var(--seal-tint, #8df0cc);
  transform-box: view-box;
  animation: seal-nova-back ${LAP}s linear infinite;
}
.seal-fx .nv-f {
  animation-name: seal-nova-front;
}
/* White marks stay white whatever the tint. Declared AFTER .nv-m: same specificity, so the later rule
   is what keeps them white. */
.seal-fx .nv-w {
  fill: #ffffff;
}
${ORBIT_CSS}${STILL_CSS}
${
  rung.lit
    ? `/* A STEADY glow. Every phase tried for a pulsing one fought the rest of the seal for the eye —
   whatever the timing, one of the two always looked like it ran on its own clock. */
.${c} {
  filter: drop-shadow(0 0 0.1em var(--seal-tint, #8df0cc))
    drop-shadow(0 0 0.24em var(--seal-tint, #8df0cc));
}`
    : // Cold rung: a thinner ring, a slower pulse, and whatever colour the viewer picked dimmed and drained
      // — a star that has not gone off yet. Doubled selector beats the shared block, which the lit rung
      // emits again AFTER these rules; at equal specificity its duration would win.
      `.${c} {
  filter: brightness(0.62) saturate(0.72);
}
.seal-fx.${c} .nv-star {
  animation-duration: ${PULSE_COLD}s;
}`
}
`,
  };
}

export const sealNovaEmber = nova({
  id: 'seal-nova-ember',
  count: 25,
  className: 'seal-fx-nova-ember',
  lit: false,
});

export const sealNova = nova({
  id: 'seal-nova',
  count: 250,
  className: 'seal-fx-nova',
  lit: true,
});

/**
 * The colour upgrade — EARNED like the seal itself (at 500 submissions, past the nova's 250), never
 * bought. Owning it turns on a #rrggbb picker stored in EquippedCosmetics.sealColors['seal-nova'];
 * the shop renders that picker inside the nova's own ladder row. Renders nothing itself.
 */
export const sealNovaColor: SealModule = {
  id: 'seal-nova-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'submissions', count: 500 },
  upgrade: true,
  since: '2026-07-25',
  className: '',
  labels: { name: 'shop.sealColorNova', desc: 'shop.sealColorDesc' },
};
