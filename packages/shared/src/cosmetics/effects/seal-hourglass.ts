import type { SealModule } from '../types';

/**
 * The Hourglass: the WATCH TIME seal, earned by minutes watched. Replaces the eye, which was a good
 * mark but said nothing about sitting through a stream. Sand runs and the glass never empties — the
 * hours are the thing being counted, and nobody has to come and turn it over.
 *
 * Two rungs plus an earned colour upgrade, as with the nova, the black hole and the core. The tier is
 * the RELIC around the glass: the lower rung is the bare hourglass with a thin trickle, the upper one
 * adds the orbiting ring of marks and a full stream. The same object carrying more, which is the
 * ladder rule the rest of the set follows.
 *
 * Ships inner markup (see SealModule.svg): the glass, the two sand beds, the falling grains and the
 * ring are more layers than an element plus two pseudo-elements can carry. Grains are GENERATED so
 * each one's negative delay is an even slice of the fall — that is what makes the stream read as
 * continuous rather than as a clump that repeats.
 *
 * The ring is the core's ring of marks put on a TILTED orbit, and that means real orbital depth, which
 * SVG cannot do directly: paint order is document order, so one node can't move behind the glass
 * mid-orbit. So the ring is drawn TWICE — one copy before the glass, one after — and each mark is
 * visible only on the half of the orbit where its copy belongs. The handoff happens at the ellipse's
 * left and right vertices, where both copies sit at the same point, so it is invisible. This is the
 * black hole's trick (see seal-void), and the shared position keyframes are what make it cheap: every
 * mark rides the same two keyframe sets and is spread around the ring by a negative delay, so its
 * delay is its POSITION — the same generated-rhythm idea the core uses.
 *
 * An earlier build spun two full circles by animating scaleX (a flat ring flattening to an edge and
 * opening again). Cheaper, but it reads as a squashing hoop rather than something going around the
 * glass — no depth, and the near and far halves are indistinguishable.
 */

/** One trip of a grain from the neck to the bed. The cold rung runs the same fall, slower. */
const FALL = 1.9;
const FALL_COLD = 3.4;

const CX = 12;
const CY = 12;
/** The orbit. Wide and shallow — the ring is seen from slightly above, then tilted in the markup. */
const RX = 10.4;
const RY = 3.5;
/** Orbit samples. At 15° the chord sits under 1% off the true ellipse — past the point where more
 *  samples would show. Same figure the black hole settled on. */
const STEPS = 24;
/** One full lap. Marks share it and are spread around the ring by negative delays. */
const ORBIT = 8;
/** Marks on the ring. Every third is BIG and white — an even ring of identical dots reads as a
 *  loading spinner, which is the same reason the core's marks are uneven. */
const MARKS = 12;
/** Mark half-sizes: SHARDS pointing at the glass, not dots. Round dots of a legible diameter turn the
 *  ring into a chain of blobs, and at 14px a dot is a smudge — a radial sliver keeps a direction. */
const SHARD = { big: { rx: 0.5, ry: 1.45 }, small: { rx: 0.36, ry: 1 } };

/** Grain sizes, in viewBox units. Every other one is white — the hotspot convention of the set. */
const GRAINS = [0.42, 0.32, 0.38, 0.3, 0.36];

/**
 * The stream. Grains share one fall and are spread down it by negative delays, so the gap between
 * them stays even; `count` is what thins the trickle on the lower rung.
 */
const stream = (count: number, dur: number) =>
  GRAINS.slice(0, count)
    .map((r, i) => {
      const delay = (-(i / count) * dur).toFixed(2);
      return (
        `<circle class="hg-g${i % 2 ? ' hg-w' : ''}" cx="12" cy="12" r="${r}" ` +
        `style="animation-delay:${delay}s"/>`
      );
    })
    .join('');

const GLASS =
  `<path class="hg-cap" d="M7.2 3.6 H16.8 M7.2 20.4 H16.8"/>` +
  `<path class="hg-body" d="M8.6 4.2 C8.6 9 12 10.7 12 12 C12 13.3 8.6 15 8.6 19.8` +
  ` M15.4 4.2 C15.4 9 12 10.7 12 12 C12 13.3 15.4 15 15.4 19.8"/>` +
  `<path class="hg-sand hg-top" d="M9.1 5.8 C9.7 9.3 12 11 12 11.6 C12 11 14.3 9.3 14.9 5.8 Z"/>` +
  `<path class="hg-sand hg-low" d="M9.6 19.6 C10.1 16.9 13.9 16.9 14.4 19.6 Z"/>`;

/**
 * Position keyframes for ONE copy of a mark. `front` selects the half of the orbit this copy is
 * visible on: a mark is in front when it is low on screen, since the ring is seen from above. Both
 * copies share identical positions, so one negative delay keeps a mark's two copies in lockstep and
 * the pair always reads as a single mark travelling round.
 */
function orbitFrames(name: string, front: boolean): string {
  let out = `@keyframes ${name} {\n`;
  // Running total of the shard's heading, UNWRAPPED. atan2 flips between +180 and -180 once a lap, and
  // an interpolated jump like that spins the shard a full turn in one step; adding whole turns keeps
  // the sequence monotonic, and one lap lands exactly 360 on from the start, so the loop is seamless.
  let heading = 0;
  for (let i = 0; i <= STEPS; i++) {
    const p = i / STEPS;
    const th = p * Math.PI * 2;
    const x = CX + RX * Math.cos(th);
    const y = CY + RY * Math.sin(th);
    const near = Math.sin(th) > 0;
    // 0 at the far vertex, 1 at the near one — drives both the size and the brightness falloff, which
    // is what sells the tilt and doubles as the light travelling around the ring.
    const depth = (Math.sin(th) + 1) / 2;
    const scale = (0.66 + depth * 0.62).toFixed(2);
    const opacity = near === front ? (0.4 + depth * 0.6).toFixed(2) : '0';
    // Point the shard's long axis (vertical when unrotated) at the centre of the glass. Taken from the
    // PROJECTED position, so it follows the squashed ellipse rather than a circle's radii.
    const aim = (Math.atan2(CY - y, CX - x) * 180) / Math.PI - 90;
    if (i > 0) heading += ((((aim - heading) % 360) + 540) % 360) - 180;
    else heading = aim;
    out += `  ${(p * 100).toFixed(2)}% { transform: translate(${x.toFixed(2)}px, ${y.toFixed(
      2,
    )}px) rotate(${heading.toFixed(1)}deg) scale(${scale}); opacity: ${opacity}; }\n`;
  }
  return `${out}}\n`;
}

const ORBIT_CSS = `${orbitFrames('seal-hourglass-front', true)}${orbitFrames(
  'seal-hourglass-back',
  false,
)}`;

/**
 * Half of the ring. Shards carry no cx/cy and no rotation of their own — position AND heading come
 * from the keyframes — and each one's delay is its place around the orbit, so the pair of copies of
 * the same shard stays welded.
 */
const ring = (side: 'front' | 'back') =>
  `<g transform="rotate(-18 ${CX} ${CY})">` +
  Array.from({ length: MARKS }, (_, i) => {
    const s = i % 3 === 0 ? SHARD.big : SHARD.small;
    const delay = (-(i / MARKS) * ORBIT).toFixed(2);
    return (
      `<ellipse class="hg-m${side === 'front' ? ' hg-f' : ''}${i % 3 === 0 ? ' hg-w' : ''}" ` +
      `rx="${s.rx}" ry="${s.ry}" style="animation-delay:${delay}s"/>`
    );
  }).join('') +
  `</g>`;

/** Layer order IS the depth: far marks, glass, stream, neck grain, near marks over the lot. */
const svgFor = (rung: { ring: boolean; grains: number; dur: number }) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  (rung.ring ? ring('back') : '') +
  GLASS +
  stream(rung.grains, rung.dur) +
  `<circle class="hg-neck" cx="12" cy="12" r="0.62"/>` +
  (rung.ring ? ring('front') : '') +
  `</svg>`;

/** Shared shell for both rungs; only the relic around the glass and the pace differ. */
function hourglass(rung: {
  id: string;
  count: number;
  className: string;
  grains: number;
  lit: boolean;
}): SealModule {
  const c = rung.className;
  const dur = rung.lit ? FALL : FALL_COLD;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'watchMinutes', count: rung.count },
    colorUpgrade: 'seal-hourglass-color',
    since: '2026-07-26',
    ladder: 'seal-hourglass',
    className: c,
    labels: { name: 'shop.sealHourglass', desc: 'shop.sealHourglassDesc' },
    svg: svgFor({ ring: rung.lit, grains: rung.grains, dur }),
    css: `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names can't collide with
   anything outside a seal. Emitted by each rung; the duplicate in the concatenated sheet is inert. */
/* The frame stays a fixed white rather than following the tint — a coloured glass and coloured sand
   are the same value and the whole seal collapses into two flat triangles. White is also what keeps
   the SILHOUETTE (the actual "hourglass" read) legible under every colour the upgrade can produce. */
.seal-fx .hg-body,
.seal-fx .hg-cap {
  fill: none;
  stroke: #ffffff;
  stroke-linecap: round;
}
.seal-fx .hg-body {
  stroke-width: 1;
}
.seal-fx .hg-cap {
  stroke-width: 1.5;
}
/* The two beds breathe in opposite phase — the top settling as the bottom rises. A slow drift rather
   than a real drain: an hourglass that actually empties has to reset, and the jump would read as a
   glitch on a mark that is on screen for seconds at a time. */
.seal-fx .hg-sand {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.55;
  transform-box: view-box;
}
.seal-fx .hg-top {
  transform-origin: 12px 7px;
  animation: seal-hourglass-top 7.6s ease-in-out infinite;
}
.seal-fx .hg-low {
  transform-origin: 12px 19.6px;
  animation: seal-hourglass-low 7.6s ease-in-out infinite;
}
.seal-fx .hg-g {
  fill: var(--seal-tint, #8df0cc);
  transform-box: view-box;
  animation: seal-hourglass-fall ${FALL}s linear infinite;
}
.seal-fx .hg-neck {
  fill: #ffffff;
  transform-box: view-box;
  transform-origin: 12px 12px;
  animation: seal-hourglass-neck ${FALL}s ease-in-out infinite;
}
/* A mark on the ring. The back copy is the default; .hg-f swaps in the front half's keyframes. */
.seal-fx .hg-m {
  fill: var(--seal-tint, #8df0cc);
  animation: seal-hourglass-back ${ORBIT}s linear infinite;
}
.seal-fx .hg-f {
  animation-name: seal-hourglass-front;
}
/* White grains and every third mark stay white whatever the tint — the hotspot trick the black hole's
   motes use. Declared AFTER .hg-g/.hg-m: same specificity, so the later rule is what keeps them white. */
.seal-fx .hg-w {
  fill: #ffffff;
}
/* opacity 0 at both ends, so reduced-motion (animation off) parks the grains invisibly at the neck
   instead of leaving a frozen dotted line down the glass. */
@keyframes seal-hourglass-fall {
  0% {
    transform: translateY(0);
    opacity: 0;
  }
  10% {
    opacity: 1;
  }
  88% {
    opacity: 0.95;
  }
  100% {
    transform: translateY(7.2px);
    opacity: 0;
  }
}
@keyframes seal-hourglass-neck {
  0%, 100% {
    transform: scale(0.8);
    opacity: 0.75;
  }
  50% {
    transform: scale(1.25);
    opacity: 1;
  }
}
@keyframes seal-hourglass-top {
  0%, 100% {
    transform: scaleY(1);
  }
  50% {
    transform: scaleY(0.84);
  }
}
@keyframes seal-hourglass-low {
  0%, 100% {
    transform: scaleY(0.86);
  }
  50% {
    transform: scaleY(1.12);
  }
}
${ORBIT_CSS}${
      rung.lit
        ? `.${c} {
  animation: seal-hourglass-glow 3.4s ease-in-out infinite;
}
@keyframes seal-hourglass-glow {
  0%, 100% {
    filter: drop-shadow(0 0 0.05em var(--seal-tint, #8df0cc));
  }
  50% {
    filter: drop-shadow(0 0 0.15em var(--seal-tint, #8df0cc))
      drop-shadow(0 0 0.3em var(--seal-tint, #8df0cc));
  }
}`
        : // Cold rung: a bare glass on a slow trickle, with no glow. Deliberately not dimmed: a drained
          // rung reads as a broken copy of the lit one, and nobody wears it. Doubled selectors beat the
          // shared block, which the lit rung emits again AFTER these rules — at equal specificity its
          // durations would win.
          `.seal-fx.${c} .hg-g,
.seal-fx.${c} .hg-neck {
  animation-duration: ${FALL_COLD}s;
}
.seal-fx.${c} .hg-top,
.seal-fx.${c} .hg-low {
  animation-duration: 12s;
}`
    }
`,
  };
}

export const sealHourglassGlass = hourglass({
  id: 'seal-hourglass-glass',
  count: 600,
  className: 'seal-fx-hourglass-glass',
  grains: 2,
  lit: false,
});

export const sealHourglass = hourglass({
  id: 'seal-hourglass',
  count: 6000,
  className: 'seal-fx-hourglass',
  grains: 5,
  lit: true,
});

/**
 * The colour upgrade — EARNED like the seal itself (250 hours, past the relic's 100), never bought.
 * Owning it turns on a #rrggbb picker stored in EquippedCosmetics.sealColors['seal-hourglass']; the
 * shop renders that picker inside the hourglass's own ladder row. Renders nothing itself.
 */
export const sealHourglassColor: SealModule = {
  id: 'seal-hourglass-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'watchMinutes', count: 15_000 },
  upgrade: true,
  since: '2026-07-26',
  className: '',
  labels: { name: 'shop.sealColorHourglass', desc: 'shop.sealColorDesc' },
};
