import type { SealModule } from '../types';

/**
 * The Laurels: the wheel-WINS seal, earned by wins of any colour. The zero counts the outcome axis
 * (one slot in 37); this is the endurance one — a win lands roughly every other spin, so a rung
 * here measures showing up, and the artwork says so: laurels are not found, they are grown.
 *
 * Two mirrored branches on a quadratic arc, each station carrying a PAIR of leaves — an outer fan
 * and an inner row hugging the stem. The pairing is where the mass lives: one row read as a chain
 * of beads, and the silhouette rule wants a body, not a garland. Nothing sits under the wreath —
 * the weight comes from foliage alone.
 *
 * The motion is a wave of light climbing the branches. Every leaf carries a white overlay whose
 * delay is its STATION index — the generated-rhythm idea the hourglass ring uses — and all four
 * leaves of a station (two rows × two sides) share one delay, so the wave lights segments rather
 * than glitter. The delays are absolute seconds: both rungs run the wave at the same climb rate,
 * the cold one just waits longer between passes.
 *
 * The tier is what the wave ARRIVES at: on the upper rung a star ignites in the gap between the
 * branch tips just as the light reaches them, and the whole wreath glows with it. The lower rung is
 * the same body answering with the wave alone — a drained copy reads as broken, and nobody wears
 * broken.
 *
 * Every third outer leaf stays white whatever the tint (the hotspot convention of the set), and so
 * do the crossed stems and the centre berry — the silhouette must survive any colour the upgrade
 * can produce.
 */

const N = 9; // leaf stations per branch
const CYCLE = 3.6;
const CYCLE_COLD = 5.2;
/** The wave: one station's head start over the next, in seconds — identical on both rungs. */
const STEP = 0.12;

/** One branch as a quadratic bezier, right side; the left is its mirror. */
const P0 = { x: 1.2, y: 20.9 };
const P1 = { x: 9, y: 17 };
const P2 = { x: 4.4, y: 5.8 };

/**
 * The two rows of a station. Tilt is off the branch tangent, outward; opacity alternates along the
 * branch so the foliage reads as depth rather than as a stamped repeat.
 */
const ROWS = [
  { tilt: 40, rx: 0.82, ry: 1.95, op: [0.5, 0.75] },
  { tilt: 6, rx: 0.7, ry: 1.65, op: [0.35, 0.55] },
];

const r2 = (n: number) => n.toFixed(2);

/** A station's spot on the branch, and the tangent heading a leaf grows along. */
function station(sd: -1 | 1, i: number) {
  // Inset from both ends: t=0 sits in the crossed stems and t=1 puts a leaf in the star's gap.
  const t = 0.07 + (i / (N - 1)) * 0.88;
  const u = 1 - t;
  const x = 12 + sd * (u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x);
  const y = u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y;
  const tx = sd * (2 * u * (P1.x - P0.x) + 2 * t * (P2.x - P1.x));
  const ty = 2 * u * (P1.y - P0.y) + 2 * t * (P2.y - P1.y);
  // -90 because an unrotated ellipse's long axis is vertical; the tilt then fans it outward.
  const heading = (Math.atan2(ty, tx) * 180) / Math.PI - 90;
  return { x, y, heading };
}

function branch(sd: -1 | 1): string {
  let out =
    `<path class="lr-stem" d="M${r2(12 + sd * P0.x)} ${P0.y}` +
    ` Q${r2(12 + sd * P1.x)} ${P1.y} ${r2(12 + sd * P2.x)} ${P2.y}"/>`;
  for (let i = 0; i < N; i++) {
    const s = station(sd, i);
    for (const [r, row] of ROWS.entries()) {
      const a = s.heading + sd * row.tilt;
      const tr = `translate(${r2(s.x)} ${r2(s.y)}) rotate(${a.toFixed(1)})`;
      // Hotspots live on the outer row only — a white leaf buried in the inner one is wasted.
      const white = r === 0 && i % 3 === 0;
      out +=
        `<ellipse class="lr-l${white ? ' lr-w' : ''}" transform="${tr}"` +
        ` rx="${row.rx}" ry="${row.ry}" opacity="${white ? 0.85 : row.op[i % 2]}"/>`;
      out +=
        `<ellipse class="lr-o" transform="${tr}" rx="${row.rx}" ry="${row.ry}"` +
        ` style="animation-delay:${(i * STEP).toFixed(2)}s"/>`;
    }
  }
  return out;
}

/** Crossed cut ends and the berry cluster that fills the notch between them. */
const BASE =
  `<path class="lr-cross" d="M10.4 21.6 L13.2 19.6 M13.6 21.6 L10.8 19.6"/>` +
  `<circle class="lr-b" cx="11" cy="19.9" r="0.5"/>` +
  `<circle class="lr-b" cx="13" cy="19.9" r="0.5"/>` +
  `<circle class="lr-b lr-w" cx="12" cy="20.7" r="0.42"/>`;

/** The upper rung's answer: a four-point star in the gap the branch tips leave open. */
const STAR =
  `<g class="lr-star">` +
  `<path d="M12 2.6 L12.7 4.3 L12 6 L11.3 4.3 Z"/>` +
  `<path d="M10.3 4.3 L12 3.7 L13.7 4.3 L12 4.9 Z"/>` +
  `</g>`;

const svgFor = (lit: boolean) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  BASE +
  branch(-1) +
  branch(1) +
  (lit ? STAR : '') +
  `</svg>`;

/**
 * The star arms only after the wave's last station has fired: full opacity lands at 31% of the
 * cycle, past the top pair's delay — the star is the wave arriving, not a light on a timer.
 */
const SHARED = `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names can't collide
   with anything outside a seal. Emitted by each rung; the duplicate in the sheet is inert. */
.seal-fx .lr-stem {
  fill: none;
  stroke: var(--seal-tint, #8df0cc);
  stroke-width: 1;
  opacity: 0.75;
}
/* The cut ends stay white whatever the tint — they, the hotspot leaves and the centre berry are
   what keep the SILHOUETTE legible under every colour the upgrade can produce. */
.seal-fx .lr-cross {
  fill: none;
  stroke: #ffffff;
  stroke-width: 1;
  stroke-linecap: round;
}
.seal-fx .lr-l {
  fill: var(--seal-tint, #8df0cc);
}
.seal-fx .lr-b {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.85;
}
/* Declared AFTER .lr-l/.lr-b: same specificity, so the later rule is what keeps hotspots white. */
.seal-fx .lr-w {
  fill: #ffffff;
}
/* opacity 0 at rest, so reduced-motion (animation off) parks the wave invisibly instead of
   leaving every leaf doubled in white. */
.seal-fx .lr-o {
  fill: #ffffff;
  opacity: 0;
  animation: seal-laurel-wave ${CYCLE}s ease-out infinite;
}
.seal-fx .lr-star path {
  fill: #ffffff;
}
.seal-fx .lr-star {
  opacity: 0;
  transform-box: view-box;
  transform-origin: 12px 4.3px;
  animation: seal-laurel-star ${CYCLE}s ease-out infinite;
}
@keyframes seal-laurel-wave {
  0% {
    opacity: 0;
  }
  6% {
    opacity: 0.95;
  }
  20%, 100% {
    opacity: 0;
  }
}
@keyframes seal-laurel-star {
  0%, 26% {
    transform: scale(0.5);
    opacity: 0;
  }
  31% {
    transform: scale(1.15);
    opacity: 1;
  }
  45% {
    opacity: 0.5;
  }
  60%, 100% {
    transform: scale(1);
    opacity: 0;
  }
}
`;

/** Shared shell for both rungs; only what the wave arrives at differs. */
function laurel(rung: { id: string; count: number; className: string; lit: boolean }): SealModule {
  const c = rung.className;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'rouletteWins', count: rung.count },
    colorUpgrade: 'seal-laurel-color',
    since: '2026-08-30',
    ladder: 'seal-laurel',
    className: c,
    labels: { name: 'shop.sealLaurel', desc: 'shop.sealLaurelDesc' },
    svg: svgFor(rung.lit),
    css:
      SHARED +
      (rung.lit
        ? `.${c} {
  animation: seal-laurel-glow ${CYCLE}s linear infinite;
}
@keyframes seal-laurel-glow {
  0%, 24% {
    filter: drop-shadow(0 0 0.03em var(--seal-tint, #8df0cc));
  }
  33% {
    filter: drop-shadow(0 0 0.12em var(--seal-tint, #8df0cc))
      drop-shadow(0 0 0.28em var(--seal-tint, #8df0cc));
  }
  78%, 100% {
    filter: drop-shadow(0 0 0.03em var(--seal-tint, #8df0cc));
  }
}
`
        : // Cold rung: the same wave at the same climb rate (the delays are absolute), with a longer
          // quiet between passes and nothing waiting at the top. Doubled selector beats the shared
          // block, which the lit rung emits again AFTER this rule at equal specificity.
          `.seal-fx.${c} .lr-o {
  animation-duration: ${CYCLE_COLD}s;
}
`),
  };
}

export const sealLaurelSprig = laurel({
  id: 'seal-laurel-sprig',
  count: 25,
  className: 'seal-fx-laurel-sprig',
  lit: false,
});

export const sealLaurel = laurel({
  id: 'seal-laurel',
  count: 100,
  className: 'seal-fx-laurel',
  lit: true,
});

/**
 * The colour upgrade — EARNED like the seal itself, never bought. Twice the upper rung, roughly
 * 400 spins at even odds. Owning it turns on a #rrggbb picker stored in
 * EquippedCosmetics.sealColors['seal-laurel']; the shop renders that picker inside the wreath's own
 * ladder row. Renders nothing itself.
 */
export const sealLaurelColor: SealModule = {
  id: 'seal-laurel-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'rouletteWins', count: 200 },
  upgrade: true,
  since: '2026-08-30',
  className: '',
  labels: { name: 'shop.sealColorLaurel', desc: 'shop.sealColorDesc' },
};
