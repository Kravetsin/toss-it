import type { SealModule } from '../types';

/**
 * Zero: the WHEEL seal, earned by greens CAUGHT — bet on green and won, one slot in thirty-seven.
 * The mark shows exactly what it counts, which is why the ball settles in the green pocket and
 * never in a random one: a wheel that lands anywhere says "I played", and the metric says "I hit".
 *
 * Drawn FRONT-ON, like the hourglass, the core and the nova. An earlier build had it in perspective
 * — a tilted hairline ellipse with dashes on it — and it had no mass at all: every mark in this set
 * stands on a solid silhouette, and a wire hoop stands on nothing. The body here is real: an outer
 * rim, fifteen pockets cut out of a dark ground, the cone, and the turret across the middle.
 *
 * Fifteen pockets, an odd number on purpose — an even ring reads as a clock face — and ONE of them
 * is the zero, white and breaking the alternation exactly where a real wheel breaks it. The turret
 * is not decoration either: it is the only part big enough to still say "turning" at 16px, where
 * the pockets have blurred into a band, and it is what separates a wheel from a pie chart.
 *
 * Two rungs plus an earned colour upgrade, as with the nova, the core and the hourglass. The tier
 * is what the wheel ANSWERS WITH: the lower rung lights only the pocket the ball is sitting in, the
 * upper one runs that light outward through the whole ring and glows. Body, spin, ball and landing
 * are identical on both — a drained rung reads as a broken copy, and nobody wears broken.
 *
 * The ball's ANGLE is animated, never its position. Sampled as x/y it took ~9 keyframes a lap, and
 * linear interpolation turned the circle into a polygon cutting to 94% of the radius: the ball
 * visibly crawled and clung to whatever pocket it passed. Interpolating an angle IS circular
 * motion, so three laps cost two keyframes and are exact. Radius and opacity ride their own
 * animations on nested nodes, so no two of them ever contend for one property.
 */

const CX = 12;
const CY = 12;
const smooth = (k: number) => k * k * (3 - 2 * k);
const r2 = (n: number) => n.toFixed(2);

/** One turn of the wheel, and one throw of the ball. They share a clock so the ball can come to
 *  rest against the same pocket every cycle. */
const CYCLE = 3.9;
const LAPS = 3;
const DROP = 0.6; // the ball leaves the track
const SEAT = 0.74; // it is riding the pocket

const N = 15; // pockets
const SPAN = 360 / N;
const GAP = 2.4; // degrees of fret between pockets
const R = {
  rim: 10.4,
  pocketOut: 9.5,
  pocketIn: 6.7,
  cone: 6.4,
  track: 9.9,
  seat: 8.1,
};

/** The ball's rest angle in the WHEEL's frame: the middle of pocket 0, the zero. */
const ZERO = SPAN / 2;
const WHEEL_RATE = 360;
const BALL_RATE = -(360 * LAPS) / DROP;
const START = -90;

/** Unwrapped, so the eased reversal never interpolates the long way round. */
function ballAngle(p: number): number {
  const fast = START + BALL_RATE * p;
  const ride = WHEEL_RATE * p + ZERO;
  if (p <= DROP) return fast;
  if (p >= SEAT) return ride;
  return fast + (ride - fast) * smooth((p - DROP) / (SEAT - DROP));
}

function ballRadius(p: number): number {
  if (p <= DROP) return R.track;
  if (p <= SEAT) return R.track + (R.seat - R.track) * smooth((p - DROP) / (SEAT - DROP));
  // Lifted back to the track for the next throw, under cover of the fade.
  if (p < 0.94) return R.seat;
  return R.seat + (R.track - R.seat) * smooth((p - 0.94) / 0.06);
}

/** Enough samples to catch the two rate changes and no more: a straight needs two points. */
const STOPS = [0, DROP];
for (let i = 1; i < 8; i++) STOPS.push(DROP + ((SEAT - DROP) * i) / 8);
STOPS.push(SEAT, 0.88, 0.94, 0.97, 1);

const keyframes = (name: string, at: (p: number) => string) =>
  `@keyframes ${name} {\n` +
  STOPS.map((p) => `  ${(p * 100).toFixed(2)}% { ${at(p)} }`).join('\n') +
  `\n}\n`;

const point = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${r2(CX + r * Math.cos(a))} ${r2(CY + r * Math.sin(a))}`;
};

/** One pocket: an annular wedge. Large-arc is never needed — a pocket is well under a half turn. */
function wedge(i: number): string {
  const a0 = i * SPAN + GAP / 2;
  const a1 = (i + 1) * SPAN - GAP / 2;
  return (
    `M${point(R.pocketOut, a0)}` +
    `A${R.pocketOut} ${R.pocketOut} 0 0 1 ${point(R.pocketOut, a1)}` +
    `L${point(R.pocketIn, a1)}` +
    `A${R.pocketIn} ${R.pocketIn} 0 0 0 ${point(R.pocketIn, a0)}Z`
  );
}

/** The ring. `spread` is the rung: the lower one answers with the zero alone, the upper one runs
 *  the light outward from it, pocket by pocket. */
function pockets(spread: boolean): string {
  let out = '';
  for (let i = 0; i < N; i++) {
    const d = wedge(i);
    const tone = i === 0 ? 'zr-zero' : i % 2 ? 'zr-dark' : 'zr-lit';
    out += `<path class="zr-pocket ${tone}" d="${d}"/>`;
    if (i === 0 || spread) {
      const dist = Math.min(i, N - i);
      out += `<path class="zr-fire" d="${d}" style="animation-delay:${(dist * 0.06).toFixed(2)}s"/>`;
    }
  }
  return out;
}

const TURRET =
  `<g class="zr-turn">` +
  `<path class="zr-arm" d="M12 7.4 V16.6 M7.4 12 H16.6"/>` +
  `<path class="zr-arm zr-thin" d="M8.75 8.75 L15.25 15.25 M15.25 8.75 L8.75 15.25"/>` +
  `<circle class="zr-hub" cx="12" cy="12" r="1.75"/>` +
  `<circle class="zr-pin" cx="12" cy="12" r="0.7"/>` +
  `</g>`;

/** Layer order: the dark ground the pockets are cut from, the ring, the cone, the turret, the
 *  silhouette, and the ball over all of it. */
const svgFor = (spread: boolean) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  `<circle class="zr-base" cx="12" cy="12" r="${R.pocketOut}"/>` +
  `<g class="zr-turn">${pockets(spread)}</g>` +
  `<circle class="zr-cone" cx="12" cy="12" r="${R.cone}"/>` +
  TURRET +
  `<circle class="zr-rim" cx="12" cy="12" r="${R.rim}"/>` +
  `<circle class="zr-lip" cx="12" cy="12" r="${R.pocketIn}"/>` +
  `<g class="zr-orbit"><g class="zr-reach">` +
  `<circle class="zr-ball" cx="12" cy="12" r="1.05"/>` +
  `</g></g>` +
  `</svg>`;

const SHARED = `
${keyframes('seal-zero-orbit', (p) => `transform: rotate(${ballAngle(p).toFixed(2)}deg);`)}
${keyframes('seal-zero-reach', (p) => `transform: translateX(${r2(ballRadius(p))}px);`)}
@keyframes seal-zero-spin {
  to { transform: rotate(360deg); }
}
/* Off between throws: angle and radius both restart, and a ball that jumped would read as a
   glitch rather than as the next spin. */
@keyframes seal-zero-show {
  0%, 2% { opacity: 0; }
  6%, 88% { opacity: 1; }
  94%, 100% { opacity: 0; }
}
/* One pulse a cycle, timed to the landing. A pocket's delay is its distance from the zero, so on
   the upper rung the light RUNS OUTWARD instead of the ring blinking at once. */
@keyframes seal-zero-fire {
  0%, ${(SEAT * 100 - 3).toFixed(0)}% { opacity: 0; }
  ${(SEAT * 100 + 2).toFixed(0)}% { opacity: 1; }
  ${(SEAT * 100 + 24).toFixed(0)}% { opacity: 0.16; }
  100% { opacity: 0; }
}
/* Pockets and turret are one turning body, so they share one animation. */
.seal-fx .zr-turn {
  transform-box: view-box;
  transform-origin: 12px 12px;
  animation: seal-zero-spin ${CYCLE}s linear infinite;
}
.seal-fx .zr-orbit {
  transform-box: view-box;
  transform-origin: 12px 12px;
  animation: seal-zero-orbit ${CYCLE}s linear infinite;
}
.seal-fx .zr-reach {
  transform-box: view-box;
  animation: seal-zero-reach ${CYCLE}s linear infinite;
}
.seal-fx .zr-ball {
  fill: #ffffff;
  animation: seal-zero-show ${CYCLE}s linear infinite;
}
.seal-fx .zr-fire {
  fill: #ffffff;
  opacity: 0;
  animation: seal-zero-fire ${CYCLE}s linear infinite;
}
/* Not the surface's colour: this mark sits on chat, on the shop and on an alert, and a pocket has
   to stay a pocket on all three. */
.seal-fx .zr-base {
  fill: #0a0e0e;
}
.seal-fx .zr-pocket.zr-lit {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.62;
}
.seal-fx .zr-pocket.zr-dark {
  fill: #131a19;
}
/* The zero. White under every tint, and the one slot that breaks the alternation. */
.seal-fx .zr-pocket.zr-zero {
  fill: #ffffff;
  opacity: 0.9;
}
.seal-fx .zr-cone {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.18;
}
/* The silhouette stays WHITE whatever the tint: tint the rim and a dark colour collapses the whole
   mark into a blob. Same reason the hourglass keeps its glass white. */
.seal-fx .zr-rim {
  fill: none;
  stroke: #ffffff;
  stroke-width: 1.15;
}
.seal-fx .zr-lip {
  fill: none;
  stroke: #ffffff;
  stroke-width: 0.5;
  opacity: 0.5;
}
.seal-fx .zr-arm {
  fill: none;
  stroke: #ffffff;
  stroke-width: 0.85;
  stroke-linecap: round;
}
.seal-fx .zr-thin {
  stroke-width: 0.5;
  opacity: 0.55;
}
.seal-fx .zr-hub {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.85;
}
.seal-fx .zr-pin {
  fill: #ffffff;
}
`;

/** Shared shell for both rungs; only what the wheel answers with differs. */
function zero(rung: { id: string; count: number; className: string; lit: boolean }): SealModule {
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'rouletteGreens', count: rung.count },
    colorUpgrade: 'seal-zero-color',
    since: '2026-08-30',
    ladder: 'seal-zero',
    className: rung.className,
    labels: { name: 'shop.sealZero', desc: 'shop.sealZeroDesc' },
    svg: svgFor(rung.lit),
    css:
      SHARED +
      (rung.lit
        ? `.${rung.className} {
  animation: seal-zero-glow ${CYCLE}s ease-in-out infinite;
}
@keyframes seal-zero-glow {
  0%, 66% {
    filter: drop-shadow(0 0 0.03em var(--seal-tint, #8df0cc));
  }
  78% {
    filter: drop-shadow(0 0 0.14em var(--seal-tint, #8df0cc))
      drop-shadow(0 0 0.3em var(--seal-tint, #8df0cc));
  }
  100% {
    filter: drop-shadow(0 0 0.03em var(--seal-tint, #8df0cc));
  }
}
`
        : ''),
  };
}

export const sealZeroQuiet = zero({
  id: 'seal-zero-quiet',
  count: 2,
  className: 'seal-fx-zero-quiet',
  lit: false,
});

export const sealZero = zero({
  id: 'seal-zero',
  count: 10,
  className: 'seal-fx-zero',
  lit: true,
});

/**
 * The colour upgrade — EARNED like the seal itself, never bought. Twice the upper rung, which at
 * one green in thirty-seven is roughly 740 spins. Owning it turns on a #rrggbb picker stored in
 * EquippedCosmetics.sealColors['seal-zero']; the shop renders that picker inside the wheel's own
 * ladder row. Renders nothing itself.
 */
export const sealZeroColor: SealModule = {
  id: 'seal-zero-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'rouletteGreens', count: 20 },
  upgrade: true,
  since: '2026-08-30',
  className: '',
  labels: { name: 'shop.sealColorZero', desc: 'shop.sealColorDesc' },
};
