import type { SealModule } from '../types';

/**
 * The Swarm: the HOARDING seal, earned by LIFETIME dust earned. It took over this axis when the black
 * hole moved to spending — a hoard is dust you still have, so the mark has to hold it, not swallow it.
 * Nothing here is consumed: every mote just keeps circling.
 *
 * The whole piece is a 3D illusion with no 3D: motes ride a sphere that turns about its vertical axis,
 * and DEPTH IS THE ONLY SHADING — a mote's size and brightness come from the cosine of its phase, so
 * the far half recedes on its own. Same lesson as the core, where dimmed marks read as a shadow
 * falling across a turning disc rather than as marks that merely dimmed.
 *
 * There is no outline anywhere: the ball is legible purely from how the motes are distributed, which
 * is what keeps it a swarm rather than a drawn sphere. A faint haze sits at the centre for mass —
 * without it the piece dissolves in the chat gutter, where a single mote is barely a pixel.
 *
 * Latitude bands are the trick that keeps the CSS small. Every mote on one band shares a single
 * keyframe set (its y never changes; only x swings by the band's radius), so five bands cover the
 * whole sphere and each mote is placed around its band by a negative delay — the same "delay IS the
 * position" idea the black hole and the hourglass use.
 */

const CX = 12;
const CY = 12;
/** Sphere radius. Sized so the painted ball matches the rest of the set — the core's ring reaches
 *  11.2 from centre, the black hole's orbit 10.4 — rather than sitting a couple of pixels smaller. */
const R = 10;
/** One full turn of the sphere. */
const SPIN = 9;
const SPIN_COLD = 15;
/** The swell and the glow are ONE event, so they share a period and both peak at 50%: the ball
 *  brightens because it is expanding, instead of two loops drifting past each other. */
const BREATH = 3.6;
/** Samples per band orbit. The path is a plain sine, so 15° steps are already past visible. */
const STEPS = 24;
/** Latitudes, in degrees. Reach far enough up and down that the ball is as TALL as it is wide —
 *  stopping near the equator painted an oblate blob with dead space above and below. The poles
 *  themselves stay empty on purpose: a mote parked at the axis barely moves and reads as a stuck
 *  pixel, whereas one at 66° still swings a third of the radius. */
const BANDS = [-66, -34, 0, 34, 66];
/** Motes per band, densest at the equator, which is also where the sphere is widest. */
const COUNT = [3, 5, 6, 5, 3];
/** Rotates each band's starting phase so the bands don't line up into a visible seam. */
const BAND_SKEW = 0.13;

interface Mote {
  band: number;
  /** Position around the band, 0..1 — becomes both the negative delay and the resting transform. */
  frac: number;
  r: number;
  white: boolean;
  /** Only the full rung shows it: the poles and one mote per middle band. */
  litOnly: boolean;
  cls: string;
}

/** Every mote of the FULL sphere. The lower rung renders a subset of this same list, so a mote keeps
 *  its class (and therefore its resting position) across both rungs. */
const MOTES: Mote[] = [];
for (let band = 0; band < BANDS.length; band++) {
  const n = COUNT[band] as number;
  for (let j = 0; j < n; j++) {
    const i = MOTES.length;
    MOTES.push({
      band,
      frac: (j / n + band * BAND_SKEW) % 1,
      // The equator runs slightly bigger: it is the nearest part of the sphere at the widest point.
      r: band === 2 ? 0.8 : 0.66,
      white: i % 4 === 0,
      litOnly: band === 0 || band === 4 || j === n - 1,
      cls: `sw-p${i}`,
    });
  }
}

/** Where a mote sits on screen at a given point of the turn, and how near it is (0 far, 1 near). */
function at(band: number, frac: number) {
  const phi = ((BANDS[band] as number) * Math.PI) / 180;
  const th = frac * Math.PI * 2;
  return {
    x: CX + R * Math.cos(phi) * Math.sin(th),
    y: CY - R * Math.sin(phi),
    depth: (Math.cos(th) + 1) / 2,
  };
}

const scaleAt = (depth: number) => 0.55 + depth * 0.68;
/** The far half is what set the seal's overall brightness, and at 0.25 it was barely there: the ball
 *  read as a handful of near-side specks. The floor carries the depth cue just as well. */
const opacityAt = (depth: number) => 0.4 + depth * 0.6;

/** One band's orbit: x swings by the band's radius, y is fixed, depth does the rest. */
function bandFrames(band: number): string {
  let out = `@keyframes seal-swarm-b${band} {\n`;
  for (let i = 0; i <= STEPS; i++) {
    const p = i / STEPS;
    const { x, y, depth } = at(band, p);
    out +=
      `  ${(p * 100).toFixed(2)}% { transform: translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) ` +
      `scale(${scaleAt(depth).toFixed(2)}); opacity: ${opacityAt(depth).toFixed(2)}; }\n`;
  }
  return `${out}}\n`;
}

const BAND_CSS = BANDS.map((_, band) => bandFrames(band)).join('');
/** Per-band animation-name, so one `.sw-m` rule can carry the duration for all of them. */
const BAND_NAMES = BANDS.map(
  (_, band) => `.seal-fx .sw-b${band} {\n  animation-name: seal-swarm-b${band};\n}`,
).join('\n');

/**
 * Reduced motion kills the animation, and every mote of a band would then pile onto that band's 0%
 * point — the sphere would collapse into a vertical line. So each mote also gets a STATIC transform
 * for its own resting phase, which paints the same sphere standing still.
 */
const STILL_CSS = `@media (prefers-reduced-motion: reduce) {
${MOTES.map((m) => {
  const { x, y, depth } = at(m.band, m.frac);
  return (
    `  .seal-fx .${m.cls} {\n` +
    `    transform: translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${scaleAt(depth).toFixed(2)});\n` +
    `    opacity: ${opacityAt(depth).toFixed(2)};\n  }`
  );
}).join('\n')}
}`;

/** The swarm. Motes carry no cx/cy — the keyframes place them — and the haze goes first, so every
 *  mote reads as floating in front of the mass rather than being lost inside it. */
const svgFor = (lit: boolean) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  `<circle class="sw-haze" cx="${CX}" cy="${CY}" r="7"/>` +
  `<circle class="sw-haze sw-dense" cx="${CX}" cy="${CY}" r="3.9"/>` +
  MOTES.filter((m) => lit || !m.litOnly)
    .map(
      (m) =>
        `<circle class="sw-m sw-b${m.band} ${m.cls}${m.white ? ' sw-w' : ''}" r="${m.r}" ` +
        `style="animation-delay:${(-m.frac * (lit ? SPIN : SPIN_COLD)).toFixed(2)}s"/>`,
    )
    .join('') +
  `</svg>`;

/** Shared shell for both rungs; only the sphere's density and the pace differ. */
function swarm(rung: { id: string; count: number; className: string; lit: boolean }): SealModule {
  const c = rung.className;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'dustEarned', count: rung.count },
    colorUpgrade: 'seal-swarm-color',
    since: '2026-07-26',
    ladder: 'seal-swarm',
    className: c,
    labels: { name: 'shop.sealSwarm', desc: 'shop.sealSwarmDesc' },
    svg: svgFor(rung.lit),
    css: `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names can't collide with
   anything outside a seal. Emitted by each rung; the duplicate in the concatenated sheet is inert. */
.seal-fx .sw-m {
  fill: var(--seal-tint, #8df0cc);
  transform-box: view-box;
  animation: seal-swarm-b2 ${SPIN}s linear infinite;
}
${BAND_NAMES}
/* White motes stay white whatever the tint — the hotspot convention of the set. Declared AFTER
   .sw-m: same specificity, so the later rule is what keeps them white. */
.seal-fx .sw-w {
  fill: #ffffff;
}
/* The haze is the swarm's MASS: two soft discs, no outline. At 14px the motes are sub-pixel specks,
   and without this the seal thins out into nothing in the chat gutter. */
.seal-fx .sw-haze {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.22;
  transform-box: view-box;
  transform-origin: ${CX}px ${CY}px;
  animation: seal-swarm-haze ${BREATH}s ease-in-out infinite;
}
.seal-fx .sw-dense {
  opacity: 0.32;
}
@keyframes seal-swarm-haze {
  0%, 100% {
    transform: scale(0.94);
    opacity: 0.18;
  }
  50% {
    transform: scale(1.07);
    opacity: 0.36;
  }
}
${BAND_CSS}${STILL_CSS}
${
  rung.lit
    ? `.${c} {
  animation: seal-swarm-glow ${BREATH}s ease-in-out infinite;
}
@keyframes seal-swarm-glow {
  0%, 100% {
    filter: drop-shadow(0 0 0.09em var(--seal-tint, #8df0cc));
  }
  50% {
    filter: drop-shadow(0 0 0.22em var(--seal-tint, #8df0cc))
      drop-shadow(0 0 0.42em var(--seal-tint, #8df0cc));
  }
}`
    : // Cold rung: a thinner cloud, turning slower, with no glow. Deliberately not dimmed: a drained
      // rung reads as a broken copy of the lit one, and nobody wears it. Doubled selectors beat the
      // shared block, which the lit rung emits again AFTER these rules — at equal specificity its
      // duration would win.
      `.seal-fx.${c} .sw-m {
  animation-duration: ${SPIN_COLD}s;
}
.seal-fx.${c} .sw-haze {
  opacity: 0.13;
}`
}
`,
  };
}

export const sealSwarmHandful = swarm({
  id: 'seal-swarm-handful',
  count: 2000,
  className: 'seal-fx-swarm-handful',
  lit: false,
});

export const sealSwarm = swarm({
  id: 'seal-swarm',
  count: 15_000,
  className: 'seal-fx-swarm',
  lit: true,
});

/**
 * The colour upgrade — EARNED like the seal itself (40k earned, past the swarm's 15k), never bought.
 * Owning it turns on a #rrggbb picker stored in EquippedCosmetics.sealColors['seal-swarm']; the shop
 * renders that picker inside the swarm's own ladder row. Renders nothing itself.
 */
export const sealSwarmColor: SealModule = {
  id: 'seal-swarm-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'dustEarned', count: 40_000 },
  upgrade: true,
  since: '2026-07-26',
  className: '',
  labels: { name: 'shop.sealColorSwarm', desc: 'shop.sealColorDesc' },
};
