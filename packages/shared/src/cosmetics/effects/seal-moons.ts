import type { SealModule } from '../types';

/**
 * Many Moons: the BREADTH axis — a world with several satellites instead of one. Earn condition
 * absent on purpose (see `draft`): the metric is "how many DIFFERENT channels", which nothing
 * counts yet.
 *
 * Every period is a whole multiple of ONE beat (3, 4, 5, 6 and 8 of them), so five orbits still read
 * as a single system rather than five loops sharing a box. The steep 72° orbit is what keeps the set
 * from nesting: it crosses the others instead of sitting inside them.
 *
 * SIZE is the thing this seal has to fight for, and the fight is not about the viewBox — it is about
 * where the INK is. Wide orbits of small dots put every bright pixel in the corners and leave a tiny
 * body in the middle, so the seal reads as small however much of the box it technically occupies.
 * Hence: a body nearly half the box wide, moons half again as big, a haze that gives the middle mass,
 * and orbits pulled in so the outermost moon still lands inside the frame. Same lesson as the swarm,
 * where the haze is what stops the mark dissolving in the chat gutter.
 *
 * REAL orbital depth, which SVG cannot do directly: paint order is document order, so a moon cannot
 * move behind the body mid-lap. Each orbit is therefore drawn TWICE — once before the body, once
 * after — and each copy is visible only for its own half of the lap. The handoff happens where both
 * copies sit at the same point, so it is invisible. Same trick as the nova's ring.
 *
 * Two rungs. The tier is the system's DENSITY — three moons against five — plus a slower, colder
 * sky, which is the set's ladder rule (see the nova and the core).
 */

const CX = 12;
const CY = 12;
/** Samples per orbit. At 20° the chord sits well under a pixel off the true ellipse. */
const STEPS = 18;
/** The system's one beat; every period below is a multiple of it. The young sky runs slower. */
const BEAT = 2.2;
const BEAT_QUIET = 3.4;
/** The world itself. Big enough to be the seal at 15px, where the moons are specks. */
const BODY_R = 5.3;
/** Channels that must clear a rung's bar. Fixed across the ladder — the BAR is what climbs, which is
 *  why the shop shows "2/5 channels" under every rung with the bar written beneath it. */
const CHANNELS = 5;
/** Uneven tilts and sizes: five matching rings would read as a diagram of an atom. */
const MOONS = [
  { rx: 7.7, ry: 2.8, tilt: 12, beats: 3, r: 1.05, white: false, phase: 0 },
  { rx: 8.9, ry: 4.0, tilt: -28, beats: 4, r: 1.4, white: true, phase: 0.35 },
  { rx: 9.7, ry: 4.8, tilt: 72, beats: 5, r: 1.0, white: false, phase: 0.18 },
  { rx: 10.2, ry: 3.2, tilt: 40, beats: 6, r: 0.92, white: false, phase: 0.62 },
  { rx: 10.7, ry: 5.2, tilt: -8, beats: 8, r: 1.2, white: false, phase: 0.85 },
];
/** The lower rung's sky: the white moon plus the widest and the tightest orbit, so the three that
 *  remain still differ in size, tilt and period rather than reading as a thinned-out copy. */
const QUIET = [0, 1, 4];

type Moon = (typeof MOONS)[number];

const n2 = (v: number) => v.toFixed(2);

/** Where a moon sits at a point of its lap, and how near it is (0 far, 1 near). */
function at(m: Moon, p: number) {
  const th = p * Math.PI * 2;
  const t = (m.tilt * Math.PI) / 180;
  const lx = m.rx * Math.cos(th);
  const ly = m.ry * Math.sin(th);
  return {
    x: CX + lx * Math.cos(t) - ly * Math.sin(t),
    y: CY + lx * Math.sin(t) + ly * Math.cos(t),
    near: Math.sin(th) > 0,
    depth: (Math.sin(th) + 1) / 2,
  };
}

const scaleAt = (d: number) => 0.66 + d * 0.7;
const opacityAt = (d: number) => 0.45 + d * 0.55;

/** One copy of an orbit: the half belonging to the other copy is drawn at opacity 0. */
function frames(m: Moon, i: number, front: boolean): string {
  let out = `@keyframes seal-moons-${front ? 'f' : 'b'}${i} {\n`;
  for (let k = 0; k <= STEPS; k++) {
    const p = k / STEPS;
    const s = at(m, p);
    const opacity = s.near === front ? n2(opacityAt(s.depth)) : '0';
    out +=
      `  ${n2(p * 100)}% { transform: translate(${n2(s.x)}px, ${n2(s.y)}px) ` +
      `scale(${n2(scaleAt(s.depth))}); opacity: ${opacity}; }\n`;
  }
  return `${out}}\n`;
}

/** Indices this rung renders, keeping each moon's own index — so a moon holds its class, its orbit
 *  and its resting place across both rungs. */
const indices = (lit: boolean) => MOONS.map((_, i) => i).filter((i) => lit || QUIET.includes(i));

const side = (s: 'f' | 'b', lit: boolean, beat: number) =>
  indices(lit)
    .map((i) => {
      const m = MOONS[i] as Moon;
      return (
        `<circle class="mn-m mn-${s} mn-o${i}${m.white ? ' mn-w' : ''}" r="${m.r}" ` +
        `style="animation-delay:${n2(-m.phase * m.beats * beat)}s"/>`
      );
    })
    .join('');

/**
 * Per-orbit period and name, plus a RESTING place for each moon: the keyframes carry the position,
 * so with the animation off (reduced motion) every moon would otherwise pile onto its 0% point.
 * Scoped to the rung's own class — both rungs emit this block, and at equal specificity whichever
 * came last would set the other's durations.
 */
const rules = (c: string, lit: boolean, beat: number) =>
  indices(lit)
    .map((i) => {
      const m = MOONS[i] as Moon;
      const s = at(m, m.phase);
      const rest = `translate(${n2(s.x)}px, ${n2(s.y)}px) scale(${n2(scaleAt(s.depth))})`;
      return (
        `.seal-fx.${c} .mn-o${i} {\n  animation-name: seal-moons-b${i};\n` +
        `  animation-duration: ${n2(m.beats * beat)}s;\n  transform: ${rest};\n  opacity: 0;\n}\n` +
        `.seal-fx.${c} .mn-f.mn-o${i} {\n  animation-name: seal-moons-f${i};\n}\n` +
        `.seal-fx.${c} .mn-${s.near ? 'f' : 'b'}.mn-o${i} {\n  opacity: ${n2(opacityAt(s.depth))};\n}`
      );
    })
    .join('\n');

/** Shared shell for both rungs; only the sky's density, its pace and the bar it asks for differ. */
function moons(rung: {
  id: string;
  className: string;
  lit: boolean;
  /** Messages ONE channel must carry for it to count toward this rung. */
  per: number;
}): SealModule {
  const c = rung.className;
  const beat = rung.lit ? BEAT : BEAT_QUIET;
  // Per-rung gradient id: the shop shows the whole ladder at once, and a duplicate id resolves to
  // the first one in the document.
  const gid = `seal-moons-body-${rung.lit ? 'full' : 'quiet'}`;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'channelsMessaged', count: CHANNELS, per: rung.per },
    since: '2026-08-16',
    colorUpgrade: 'seal-moons-color',
    ladder: 'seal-moons',
    className: c,
    labels: { name: 'shop.sealMoons', desc: 'shop.sealMoonsDesc' },
    svg:
      `<svg viewBox="0 0 24 24" aria-hidden="true">` +
      `<defs><radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="9.9" cy="9.8" r="10">` +
      `<stop class="mn-hot" offset="0"/><stop class="mn-hot" offset="0.1"/>` +
      `<stop class="mn-cool" offset="0.66"/><stop class="mn-cool" offset="1"/>` +
      `</radialGradient></defs>` +
      `<circle class="mn-haze" cx="${CX}" cy="${CY}" r="7.6"/>` +
      side('b', rung.lit, beat) +
      `<circle class="mn-body" cx="${CX}" cy="${CY}" r="${BODY_R}" fill="url(#${gid})"/>` +
      side('f', rung.lit, beat) +
      `</svg>`,
    css: `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names cannot collide
   with anything outside a seal. Emitted by each rung; the duplicate in the sheet is inert.

   transform-origin: 0 0 is load-bearing. With the default (the view-box centre) a keyframe's
   translate+scale lands the moon at x + 12(1 - scale), and the orbit warps with depth. */
.seal-fx .mn-m {
  fill: var(--seal-tint, #8df0cc);
  transform-box: view-box;
  transform-origin: 0 0;
  animation: seal-moons-b0 ${n2(3 * BEAT)}s linear infinite;
}
/* The white moon stays white whatever the tint — the hotspot convention of the set. */
.seal-fx .mn-w {
  fill: #ffffff;
}
/* The MASS of the seal at small sizes: an atmosphere the body sits in. Without it the middle is one
   flat disc and the whole mark thins out in the chat gutter. */
.seal-fx .mn-haze {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.14;
  transform-box: view-box;
  transform-origin: ${CX}px ${CY}px;
  animation: seal-moons-breath ${n2(3 * BEAT)}s ease-in-out infinite;
}
/* The body is shaded by a gradient whose stops are coloured from CSS, so --seal-tint still repaints
   it; an off-centre hot spot is what stops it reading as a flat disc. */
.seal-fx .mn-hot {
  stop-color: #ffffff;
}
.seal-fx .mn-cool {
  stop-color: var(--seal-tint, #8df0cc);
}
.seal-fx .mn-body {
  transform-box: view-box;
  transform-origin: ${CX}px ${CY}px;
  animation: seal-moons-breath ${n2(3 * BEAT)}s ease-in-out infinite;
}
${rules(c, rung.lit, beat)}
@keyframes seal-moons-breath {
  0%, 100% {
    transform: scale(0.97);
    filter: brightness(1);
  }
  50% {
    transform: scale(1.03);
    filter: brightness(1.2);
  }
}
${MOONS.map((m, i) => frames(m, i, false) + frames(m, i, true)).join('')}
${
  rung.lit
    ? `.${c} {
  filter: drop-shadow(0 0 0.08em var(--seal-tint, #8df0cc))
    drop-shadow(0 0 0.2em var(--seal-tint, #8df0cc));
}`
    : // Young rung: a thinner sky, turning slower, and NO glow — the glow is what the full rung is
      // for. Deliberately not dimmed: a drained first rung reads as a broken copy, and nobody wears
      // it. Doubled selectors beat the shared block, which the full rung emits again AFTER these
      // rules.
      `.seal-fx.${c} .mn-haze {
  opacity: 0.1;
  animation-duration: ${n2(3 * BEAT_QUIET)}s;
}
.seal-fx.${c} .mn-body {
  animation-duration: ${n2(3 * BEAT_QUIET)}s;
}`
}
`,
  };
}

export const sealMoonsQuiet = moons({
  id: 'seal-moons-quiet',
  className: 'seal-fx-moons-quiet',
  lit: false,
  per: 25,
});

export const sealMoons = moons({
  id: 'seal-moons',
  className: 'seal-fx-moons',
  lit: true,
  per: 100,
});

/**
 * The colour upgrade — EARNED like the seal itself, never bought. Owning it turns on a #rrggbb
 * picker stored in EquippedCosmetics.sealColors['seal-moons']; the shop renders that picker inside
 * the family's own ladder row. Renders nothing itself.
 */
export const sealMoonsColor: SealModule = {
  id: 'seal-moons-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'channelsMessaged', count: CHANNELS, per: 250 },
  since: '2026-08-16',
  upgrade: true,
  className: '',
  labels: { name: 'shop.sealColorMoons', desc: 'shop.sealColorDesc' },
};
