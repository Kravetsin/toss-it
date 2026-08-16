import type { SealModule } from '../types';

/**
 * The Growth Rings: the WATCH-TIME side of the breadth family — hours kept in several places at
 * once. Earn condition absent on purpose (see `draft`): it counts hours across DIFFERENT channels
 * (undeduplicated — two streams open at the same hour both count), which nothing answers yet.
 *
 * A cross-section that keeps growing: a wave runs from the pith outward and the ring that has just
 * closed flashes white. Time is IN the object rather than written on it, which is the difference
 * between a seal and a badge.
 *
 * Two details do the work. The rings are LUMPY, and every ring shares the same lumps — rings follow
 * the trunk, not chance — so they read as one body rather than as nested circles. And the same three
 * radial fissures are missing from every ring, which lines the gaps up into cracks running out of
 * the pith; without them, concentric circles read as a target.
 *
 * Two rungs, and the ladder is the obvious one for a trunk: a sapling with two rings against a grown
 * one with four, growing slower because there is less of it.
 */

const CX = 12;
const CY = 12;
/** One growth beat: the wave, the flash and the body's swell all ride it. */
const BEAT = 2.6;
const BEAT_YOUNG = 3.6;
/** The core is FILLED, so the disc has mass in the middle at 15px. The sapling's is smaller, which
 *  is what keeps its two rings from reading as a shrunken copy of the grown one. */
const CORE = { grown: 3.7, young: 2.9 };
const RINGS = [
  { r: 5.4, w: 1.2 },
  { r: 7.3, w: 1.1 },
  { r: 9, w: 1 },
  { r: 10.3, w: 0.95 },
];
/** How many rings each rung has closed. */
const COUNT = { grown: 4, young: 2 };
/** Angles the fissures run along, and their half-width in degrees. */
const CRACKS = [-58, 34, 152];
const CRACK_HALF = 4.6;
/** Samples per ring. Below ~72 the lumps turn into visible facets at 96px. */
const STEPS = 96;

const n2 = (v: number) => v.toFixed(2);
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Lumps shared by every ring — correlated, because rings follow the trunk. */
const wobble = (th: number) =>
  1 +
  0.05 * Math.sin(3 * th + 0.7) +
  0.032 * Math.cos(5 * th + 2.1) +
  0.022 * Math.sin(2 * th - 1.2);

const inCrack = (deg: number) =>
  CRACKS.some((g) => Math.abs(((deg - g + 540) % 360) - 180) < CRACK_HALF);

/**
 * One ring, offset slightly per index so the pith sits off-centre like a real trunk. Sampling starts
 * inside the first crack, so no run is split across the seam. Ring 0 is the filled core and keeps
 * its whole circumference.
 */
function ringPath(r: number, k: number): string {
  const cx = CX - 0.18 * k;
  const cy = CY + 0.13 * k;
  let d = '';
  let pen = false;
  for (let i = 0; i <= STEPS; i++) {
    const deg = (CRACKS[0] as number) + (i / STEPS) * 360;
    if (k > 0 && inCrack(deg)) {
      pen = false;
      continue;
    }
    const th = rad(deg);
    const rr = r * wobble(th);
    d += `${pen ? 'L' : 'M'}${n2(cx + rr * Math.cos(th))} ${n2(cy + rr * Math.sin(th))}`;
    pen = true;
  }
  return k > 0 ? d : `${d}Z`;
}

/** The outermost ring peaks LAST, so the wave runs outward. A lag has to be written as a negative
 *  delay of (period − lag), or the ring would run ahead of the wave instead of behind it. */
const delay = (k: number, beat: number) => n2(-((1 - 0.11 * k) % 1) * beat);

/** Channels that must clear a rung's bar. Three, not five: hours are the slowest thing a viewer can
 *  spend, so the breadth here is deliberately narrower than the other families'. */
const CHANNELS = 3;

/** Shared shell for both rungs; only how many rings have closed and how fast they grow differ. */
function rings(rung: {
  id: string;
  className: string;
  lit: boolean;
  /** MINUTES one channel must have been watched for it to count toward this rung. */
  per: number;
}): SealModule {
  const c = rung.className;
  const beat = rung.lit ? BEAT : BEAT_YOUNG;
  const core = rung.lit ? CORE.grown : CORE.young;
  const grown = RINGS.slice(0, rung.lit ? COUNT.grown : COUNT.young);
  const last = grown[grown.length - 1] as { r: number; w: number };
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'channelsWatched', count: CHANNELS, per: rung.per },
    since: '2026-08-16',
    colorUpgrade: 'seal-rings-color',
    ladder: 'seal-rings',
    className: c,
    labels: { name: 'shop.sealRings', desc: 'shop.sealRingsDesc' },
    svg:
      `<svg viewBox="0 0 24 24" aria-hidden="true"><g class="rg-all">` +
      `<path class="rg-core" d="${ringPath(core, 0)}"/>` +
      `<circle class="rg-pith" cx="${CX}" cy="${CY - 0.2}" r="${rung.lit ? 1.15 : 0.95}"/>` +
      grown
        .map(
          (g, k) =>
            `<path class="rg-r" d="${ringPath(g.r, k + 1)}" stroke-width="${g.w}" ` +
            `style="animation-delay:${delay(k, beat)}s"/>`,
        )
        .join('') +
      `<path class="rg-new" d="${ringPath(last.r, grown.length)}" ` +
      `style="animation-delay:${delay(grown.length - 1, beat)}s"/>` +
      `</g></svg>`,
    css: `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names cannot collide
   with anything outside a seal. Emitted by each rung; the duplicate in the sheet is inert.

   The body swells on the same beat the wave runs, so the disc reads as one growing thing rather
   than as rings that happen to blink. */
.seal-fx .rg-all {
  transform-box: view-box;
  transform-origin: ${CX}px ${CY}px;
  animation: seal-rings-breath ${BEAT}s ease-in-out infinite;
}
.seal-fx .rg-core {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.92;
}
/* The pith stays white whatever the tint — the hotspot convention of the set. */
.seal-fx .rg-pith {
  fill: #ffffff;
}
.seal-fx .rg-r {
  fill: none;
  stroke: var(--seal-tint, #8df0cc);
  stroke-linecap: round;
  opacity: 0.72;
  animation: seal-rings-wave ${BEAT}s ease-in-out infinite;
}
/* A second copy of the outermost ring, white, flashing exactly when that ring peaks: the year that
   has just closed. */
.seal-fx .rg-new {
  fill: none;
  stroke: #ffffff;
  stroke-width: 1.05;
  stroke-linecap: round;
  opacity: 0;
  animation: seal-rings-fresh ${BEAT}s ease-out infinite;
}
@keyframes seal-rings-breath {
  0%, 100% {
    transform: scale(0.97);
  }
  55% {
    transform: scale(1.035);
  }
}
@keyframes seal-rings-wave {
  0% {
    opacity: 0.45;
  }
  20% {
    opacity: 1;
  }
  60%, 100% {
    opacity: 0.45;
  }
}
@keyframes seal-rings-fresh {
  0% {
    opacity: 0;
  }
  20% {
    opacity: 0.85;
  }
  46%, 100% {
    opacity: 0;
  }
}
${
  rung.lit
    ? `.${c} {
  filter: drop-shadow(0 0 0.07em var(--seal-tint, #8df0cc))
    drop-shadow(0 0 0.19em var(--seal-tint, #8df0cc));
}`
    : // Sapling: two rings, growing slower, and NO glow — the glow is what the grown trunk is for.
      // Deliberately not dimmed: a drained first rung reads as a broken copy, and nobody wears it.
      // Doubled selectors beat the shared block, which the grown rung emits again AFTER these rules.
      `.seal-fx.${c} .rg-all,
.seal-fx.${c} .rg-r,
.seal-fx.${c} .rg-new {
  animation-duration: ${BEAT_YOUNG}s;
}`
}
`,
  };
}

export const sealRingsSapling = rings({
  id: 'seal-rings-sapling',
  className: 'seal-fx-rings-sapling',
  lit: false,
  per: 600,
});

export const sealRings = rings({
  id: 'seal-rings',
  className: 'seal-fx-rings',
  lit: true,
  per: 1500,
});

/**
 * The colour upgrade — EARNED like the seal itself, never bought. Owning it turns on a #rrggbb
 * picker stored in EquippedCosmetics.sealColors['seal-rings']. Renders nothing itself.
 */
export const sealRingsColor: SealModule = {
  id: 'seal-rings-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'channelsWatched', count: CHANNELS, per: 3000 },
  since: '2026-08-16',
  upgrade: true,
  className: '',
  labels: { name: 'shop.sealColorRings', desc: 'shop.sealColorDesc' },
};
