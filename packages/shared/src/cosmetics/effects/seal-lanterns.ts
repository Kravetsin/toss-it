import type { SealModule } from '../types';

/**
 * The Lanterns: sky lanterns let go one after another — the SUBMISSIONS side of the breadth family.
 * Earn condition absent on purpose (see `draft`): it is meant to count sends across DIFFERENT
 * channels, and no counter answers that yet.
 *
 * They are sky lanterns, not hanging lamps: dome up, open mouth down with the flame at it, a string
 * trailing below. A hanging lamp that happens to move upward reads as an object falling the wrong
 * way — the silhouette has to say which way is up before the motion can.
 *
 * The large motion is the DRAUGHT, not the rise. A dozen specks each drifting a couple of pixels is
 * invisible at 15px; the whole stream leaning together as one is not. Each lantern is brightest and
 * biggest as it crosses the middle, so the light always sits in the centre of the box however the
 * column happens to be spaced — the same "mass in the middle" rule the moons seal is built on.
 *
 * Every third lantern is FAR: half the size and light, twice the period. A whole multiple, so the
 * parallax costs no second clock.
 *
 * Two rungs: five lanterns against a dozen, released slower. The lower rung keeps every fourth
 * lantern of the full stream, so the few that remain stay evenly spread instead of bunching.
 */

const CX = 12;
const CY = 12;
/** The one period. Far lanterns run at twice this; the draught and the haze at exactly this. */
const RISE = 3.8;
const RISE_FEW = 5.6;
const COUNT = 12;
/** Samples per trip. The path is a slow sine, so 8 segments are already past visible. */
const STEPS = 8;
/** The lower rung's stream: four near lanterns a quarter-period apart, plus one far one. */
const FEW = [0, 3, 5, 6, 9];
/** Channels that must clear a rung's bar. Fixed across the ladder — the BAR is what climbs. */
const CHANNELS = 5;

const n2 = (v: number) => v.toFixed(2);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
/** Deterministic jitter: the stream must be uneven but identical on every build. */
const seeded = (s: number) => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

interface Lantern {
  i: number;
  far: boolean;
  x0: number;
  sc: number;
  sway: number;
  ph: number;
  /** Place in the stream, 0..1 of this lantern's own period — becomes a negative delay per rung. */
  phase: number;
}

const rnd = seeded(31);
const raw = Array.from({ length: COUNT }, (_, i) => {
  const far = i % 3 === 2;
  return {
    i,
    far,
    // Weighted toward the middle: the column has to be a body, not a curtain across the box.
    x0: CX + (rnd() - 0.5) * 13,
    sc: far ? 0.45 + rnd() * 0.2 : 0.82 + rnd() * 0.42,
    sway: 0.8 + rnd() * 1.2,
    ph: rnd() * 6.28,
  };
});
const NEAR_N = raw.filter((l) => !l.far).length;
let nearSeen = 0;
let farSeen = 0;
/** Each group is spread over its OWN period, so near and far both cover the whole column. */
const LANTERNS: Lantern[] = raw.map((l) => ({
  ...l,
  phase: l.far ? farSeen++ / (COUNT - NEAR_N) : nearSeen++ / NEAR_N,
}));

const period = (l: Lantern, lit: boolean) => (lit ? RISE : RISE_FEW) * (l.far ? 2 : 1);
const stream = (lit: boolean) => LANTERNS.filter((l) => lit || FEW.includes(l.i));

/** One lantern's trip up the box: position, size, brightness and fade at each sample. */
const trip = (l: Lantern) =>
  Array.from({ length: STEPS + 1 }, (_, k) => {
    const p = k / STEPS;
    const bell = Math.sin(Math.PI * p);
    return {
      p,
      x: l.x0 + l.sway * Math.sin(l.ph + p * 3.6),
      y: 21.6 - 19.4 * p,
      s: l.sc * (0.82 + 0.3 * bell),
      f: 0.8 + 0.55 * bell,
      o: (p < 0.14 ? p / 0.14 : p > 0.82 ? (1 - p) / 0.18 : 1) * (l.far ? 0.5 : 0.95),
    };
  });

type Row = ReturnType<typeof trip>[number];

const frames = (name: string, rows: Row[]) =>
  `@keyframes ${name} {\n` +
  rows
    .map(
      (r) =>
        `  ${n2(r.p * 100)}% { transform: translate(${n2(r.x)}px, ${n2(r.y)}px) scale(${n2(r.s)});` +
        ` filter: brightness(${n2(r.f)}); opacity: ${n2(clamp(r.o))}; }`,
    )
    .join('\n') +
  `\n}\n`;

/**
 * Per-lantern period, place in the stream and the pose it falls back to with the animation off —
 * mid-flight, not piled at the origin. Scoped to the rung's class: both rungs emit this block, and
 * at equal specificity whichever came last would set the other's pace.
 */
const rules = (c: string, lit: boolean) =>
  stream(lit)
    .map((l) => {
      const dur = period(l, lit);
      const r = trip(l)[Math.floor(STEPS / 2)] as Row;
      return (
        `.seal-fx.${c} .ln-l${l.i} {\n  animation-name: seal-lanterns-l${l.i};\n` +
        `  animation-duration: ${n2(dur)}s;\n  animation-delay: ${n2(-l.phase * dur)}s;\n` +
        `  transform: translate(${n2(r.x)}px, ${n2(r.y)}px) scale(${n2(r.s)});\n` +
        `  opacity: ${n2(clamp(r.o))};\n}\n`
      );
    })
    .join('');

/**
 * The paper balloon, drawn around its own (0,0): a dome over a body tapering to the mouth, the lit
 * opening, the flame inside it, and the string trailing below.
 */
const LANTERN =
  `<path class="ln-cord" d="M0 1.7 L-0.24 2.9"/>` +
  `<path class="ln-body" d="M-1.32 -0.3 C-1.32 -2.45 1.32 -2.45 1.32 -0.3 ` +
  `C1.32 0.72 0.92 1.15 0.74 1.62 L-0.74 1.62 C-0.92 1.15 -1.32 0.72 -1.32 -0.3 Z"/>` +
  `<ellipse class="ln-mouth" cx="0" cy="1.62" rx="0.74" ry="0.22"/>` +
  `<circle class="ln-flame" cx="0" cy="0.95" r="0.52"/>`;

/** Shared shell for both rungs; only how many lanterns are up and how fast they rise differ. */
function lanterns(rung: {
  id: string;
  className: string;
  lit: boolean;
  /** Submissions ONE channel must have received for it to count toward this rung. */
  per: number;
}): SealModule {
  const c = rung.className;
  const pace = rung.lit ? RISE : RISE_FEW;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'channelsSent', count: CHANNELS, per: rung.per },
    since: '2026-08-16',
    colorUpgrade: 'seal-lanterns-color',
    ladder: 'seal-lanterns',
    className: c,
    labels: { name: 'shop.sealLanterns', desc: 'shop.sealLanternsDesc' },
    svg:
      `<svg viewBox="0 0 24 24" aria-hidden="true">` +
      `<circle class="ln-haze" cx="${CX}" cy="${CY}" r="7.4"/>` +
      `<g class="ln-all">` +
      stream(rung.lit)
        .map((l) => `<g class="ln-l ln-l${l.i}">${LANTERN}</g>`)
        .join('') +
      `</g></svg>`,
    css: `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names cannot collide
   with anything outside a seal. Emitted by each rung; the duplicate in the sheet is inert.

   The haze is the seal's MASS: a dozen small lanterns leave the middle empty on their own, and the
   mark thins out in the chat gutter (see seal-moons). */
.seal-fx .ln-haze {
  fill: var(--seal-tint, #8df0cc);
  transform-box: view-box;
  transform-origin: ${CX}px ${CY}px;
  animation: seal-lanterns-haze ${RISE}s ease-in-out infinite;
}
/* ONE draught over the whole stream — the large motion here. The rise alone is a dozen specks
   travelling a couple of pixels and reads as nothing at 15px. */
.seal-fx .ln-all {
  transform-box: view-box;
  transform-origin: ${CX}px 23px;
  animation: seal-lanterns-draft ${RISE}s ease-in-out infinite;
}
.seal-fx .ln-body {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.85;
}
/* The lit mouth and the flame stay white whatever the tint — the set's hotspot convention, and what
   makes a paper bag read as a lantern. */
.seal-fx .ln-mouth,
.seal-fx .ln-flame {
  fill: #ffffff;
}
.seal-fx .ln-cord {
  stroke: var(--seal-tint, #8df0cc);
  stroke-width: 0.18;
  opacity: 0.55;
}
/* Lanterns are drawn around their own (0,0) and placed entirely by keyframes, hence origin 0 0:
   with the default view-box centre a scaled keyframe would drift them by 12(1 - scale). */
.seal-fx .ln-l {
  transform-box: view-box;
  transform-origin: 0 0;
  animation: seal-lanterns-l0 ${RISE}s linear infinite;
}
${rules(c, rung.lit)}@keyframes seal-lanterns-draft {
  0%, 100% {
    transform: rotate(-2.6deg);
  }
  50% {
    transform: rotate(2.6deg);
  }
}
@keyframes seal-lanterns-haze {
  0%, 100% {
    transform: scale(0.95);
    opacity: 0.13;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.23;
  }
}
${LANTERNS.map((l) => frames(`seal-lanterns-l${l.i}`, trip(l))).join('')}
${
  rung.lit
    ? `.${c} {
  animation: seal-lanterns-glow ${RISE}s ease-in-out infinite;
}
@keyframes seal-lanterns-glow {
  0%, 100% {
    filter: drop-shadow(0 0 0.06em var(--seal-tint, #8df0cc));
  }
  50% {
    filter: drop-shadow(0 0 0.15em var(--seal-tint, #8df0cc))
      drop-shadow(0 0 0.3em var(--seal-tint, #8df0cc));
  }
}`
    : // First lanterns: a thin stream, a slower draught, and NO glow — the glow is what the full
      // stream is for. Deliberately not dimmed: a drained first rung reads as a broken copy, and
      // nobody wears it. Doubled selectors beat the shared block, which the full rung emits again
      // AFTER these rules.
      `.seal-fx.${c} .ln-all,
.seal-fx.${c} .ln-haze {
  animation-duration: ${n2(pace)}s;
}
.seal-fx.${c} .ln-haze {
  opacity: 0.1;
}`
}
`,
  };
}

export const sealLanternsFew = lanterns({
  id: 'seal-lanterns-few',
  className: 'seal-fx-lanterns-few',
  lit: false,
  per: 3,
});

export const sealLanterns = lanterns({
  id: 'seal-lanterns',
  className: 'seal-fx-lanterns',
  lit: true,
  per: 10,
});

/**
 * The colour upgrade — EARNED like the seal itself, never bought. Owning it turns on a #rrggbb
 * picker stored in EquippedCosmetics.sealColors['seal-lanterns']. Renders nothing itself.
 */
export const sealLanternsColor: SealModule = {
  id: 'seal-lanterns-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'channelsSent', count: CHANNELS, per: 25 },
  since: '2026-08-16',
  upgrade: true,
  className: '',
  labels: { name: 'shop.sealColorLanterns', desc: 'shop.sealColorDesc' },
};
