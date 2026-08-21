import {
  type Concept,
  blob,
  clamp,
  easeIn,
  easeInOut,
  easeOut,
  hash,
  rgba,
  span,
  TAU,
} from './scene';

/**
 * CONCEPT — "the wand duel": two jets of light come in from off-card left and right, LOCK in the
 * middle, and shove each other back and forth. No figures, no wands, no crest — only the two beams,
 * the knot of light where they meet, and what that knot throws off.
 *
 * THE CONTACT POINT IS THE ANIMATION. Everything else is derived from it: each beam is drawn from its
 * own edge TO that point, so the winning beam lengthens and the losing one is crushed short, and the
 * sparks always come off the real meeting place. Authoring two beams and hoping they touch is how a
 * duel turns into two lines overlapping.
 *
 * THE KNOT HAS ONE COLOUR AND KEEPS IT. It is a weld: white core, warm halo, always. Tinting it by
 * whoever is currently winning is the one thing that breaks it — the contact stops being a place
 * where two powers meet and starts being a token that belongs to a side. Who is winning is told by
 * the BEAMS (the crushed one runs brighter and thicker) and by where the knot has been driven to.
 *
 * A LONG LOOP, UNEVENLY PACED. Sixteen seconds, and none of the pushes match: a probe, a lean that is
 * answered, a stalemate that barely moves, a slow grind out to the edge, a slip. Every push is
 * easeIn (pressure accumulates, then gives) and every recoil easeOut (spent at once, then settles).
 * Depths and durations differ on purpose — equal beats are a metronome, and a metronome is the one
 * thing a duel cannot look like. There is no burst at the turn: an explosion there asks the viewer
 * what exploded, and there is no honest answer.
 *
 * THE BEAM IS A ROPE WITH KINKS, NOT A BOLT. The kinks are triangle waves (hard corners at any sample
 * density — a sine sampled coarsely gives soft bends and looks like rope), scrolling along the beam at
 * WHOLE cycles per loop, anchored to zero amplitude at both ends: a jet is held at the wand tip and
 * welded at the contact, and it writhes in between.
 *
 * BENDS ARE COUNTED AGAINST THE ROOM THEY HAVE. Cycles scale with the box's height AND with the beam's
 * own length, so a chat row gets a lazy curve and a full card gets a proper zigzag, at the same angle.
 * A fixed cycle count is what turns a short row — and any beam crushed back toward its own wand —
 * into a comb of impossible corners.
 *
 * The beads sliding down the losing beam are the one detail taken from the source's actual mechanic
 * rather than from a memory of the scene: the beads run toward the loser, and they turn around when
 * the pressure does.
 */

const GREEN = '#55ff9e';
const RED = '#ff4b4b';
const HOT = '#ffcf94'; // the weld: the scene's only warm colour, and it never moves off the contact
const WHITE = '#ffffff';
const LOOP = 16000;
/** Pressure at which a side is fully crushed; everything strain-driven is read against it. */
const PEAK = 0.3;

/** Where the contact sits, as a fraction of the card's width off centre. + = the left beam is winning. */
interface Beat {
  at: number;
  to: number;
  ease: (t: number) => number;
}
const BEATS: Beat[] = [
  { at: 0, to: 0, ease: easeInOut },
  { at: 1200, to: 0.06, ease: easeInOut }, // a probe, barely a shove
  { at: 2600, to: -0.02, ease: easeInOut }, // answered, and it drifts past the middle
  { at: 4200, to: 0.14, ease: easeIn }, // a real lean this time
  { at: 5600, to: 0.1, ease: easeInOut }, // stalemate: the knot hardly moves, it only shakes
  { at: 7000, to: PEAK, ease: easeIn }, // ground out to the edge
  { at: 7900, to: 0.16, ease: easeOut }, // held, and shoved back
  { at: 9000, to: 0.06, ease: easeInOut },
  { at: 10200, to: -0.12, ease: easeIn }, // the other side takes over
  { at: 11100, to: -0.08, ease: easeOut }, // a stumble in the middle of its own push
  { at: 12600, to: -PEAK, ease: easeIn }, // deepest of the loop
  { at: 13600, to: -0.1, ease: easeOut }, // it slips
  { at: 15000, to: 0.05, ease: easeInOut },
  { at: LOOP, to: 0, ease: easeInOut },
];

/** Signed pressure at `t`: + means the left beam is pushing the contact toward the right edge. */
function pressure(t: number): number {
  let prev = BEATS[0]!;
  for (let i = 1; i < BEATS.length; i++) {
    const b = BEATS[i]!;
    if (t <= b.at) return prev.to + (b.to - prev.to) * b.ease(span(t, prev.at, b.at));
    prev = b;
  }
  return prev.to;
}

/** How hard the crushed side is straining at `t`, 0..1 — the scene's only "event" scalar. */
function strain(t: number): number {
  return clamp(Math.abs(pressure(t)) / PEAK, 0, 1);
}

/** The contact point at `t`. A pure function of time, so a spark born earlier can ask where it came from. */
function contact(t: number, w: number, h: number): [number, number] {
  const v = pressure(t);
  const u = t / LOOP;
  // Tremble: two locked beams never sit still, and the harder they are leaning the worse it shakes.
  const shake = 0.25 + Math.abs(v) * 2.2;
  const x = w * (0.5 + v) + Math.sin(TAU * 34 * u) * w * 0.006 * shake;
  const y =
    h * 0.5 + Math.sin(TAU * (6 * u + 0.2)) * h * 0.05 + Math.sin(TAU * 40 * u) * h * 0.012 * shake;
  return [x, y];
}

/** Triangle wave, period 1, range -1..1 — a corner every half period, however coarsely it is sampled. */
function tri(x: number): number {
  return 1 - 4 * Math.abs(x - Math.round(x));
}

/**
 * A point on a beam, `s` from the wand tip (0) to the contact (1). Sampled by the stroke, by the
 * beads and by the forks alike, so nothing ever floats beside the beam it belongs to. `cyc` is how
 * many base kinks this beam has room for (see the header).
 */
function beamAt(
  s: number,
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  amp: number,
  cyc: number,
  t: number,
  seed: number,
): [number, number] {
  const dx = cx - ax;
  const dy = cy - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const env = Math.sin(Math.PI * clamp(s, 0, 1)) ** 0.8;
  const u = t / LOOP;
  const wob =
    Math.sin(TAU * (cyc * s + 9 * u + seed)) * 0.55 +
    tri(cyc * 2.1 * s - 15 * u + seed * 1.7) * 0.3 +
    tri(cyc * 4.3 * s + 25 * u + seed * 2.3) * 0.14;
  return [ax + dx * s + nx * env * amp * wob, ay + dy * s + ny * env * amp * wob];
}

/** Stroke a sampled beam three times: colour wash, colour body, white core. */
function drawBeam(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  color: string,
  width: number,
  power: number,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i]!;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = rgba(color, 0.13 * power);
  ctx.lineWidth = width * 4.2;
  ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.42 * power);
  ctx.lineWidth = width * 1.9;
  ctx.stroke();
  ctx.strokeStyle = rgba(WHITE, 0.9 * power);
  ctx.lineWidth = Math.max(0.7, width * 0.8);
  ctx.stroke();
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const v = pressure(t);
  const heat = strain(t);
  const [cx, cy] = contact(t, w, h);
  const scale = Math.min(h, w * 0.45);
  const edge = Math.max(5, h * 0.07);
  // The wands are off-card on purpose: what is drawn is the light between them, not the duellists.
  const lx = -edge;
  const ly = h * 0.5 + h * 0.05;
  const rx = w + edge;
  const ry = h * 0.5 - h * 0.05;

  ctx.globalCompositeOperation = 'lighter';

  // Light first, so everything else sits IN it. Each wand lights its own end and flares as it is
  // driven back; the weld lights the middle, and its light is warm at every moment of the loop.
  blob(ctx, GREEN, lx, ly, h * 1.5, 0.15 + Math.max(0, -v) * 0.3);
  blob(ctx, RED, rx, ry, h * 1.5, 0.15 + Math.max(0, v) * 0.3);
  blob(ctx, HOT, cx, cy, h * (1.15 + heat * 0.45), 0.2 + heat * 0.22);

  // Dust across the full width. Painted WHITE and thin: additive over the beams' own wash, a mote
  // comes out the colour of the light it is standing in, which is both cheaper and more honest than
  // picking a side for it — a speck of dust does not belong to a duellist.
  //
  // WHOLE laps per loop: a mote on its own free pace lands mid-crossing when the loop wraps, and the
  // whole field jumps back to its start at once.
  for (let i = 0; i < 24; i++) {
    const laps = Math.round(hash(i, 31) * 6) - 3;
    const mx = ((((hash(i, 33) + (t / LOOP) * laps) % 1) + 1) % 1) * w;
    const my =
      (hash(i, 34) * 0.9 + 0.05 + Math.sin(((t / LOOP) * 3 + hash(i, 35)) * TAU) * 0.05) * h;
    const lit = clamp(1 - Math.hypot(mx - cx, my - cy) / (h * 0.9), 0, 1);
    // Away from the knot a mote still catches the beam it is closest to, so the corners aren't dead.
    const along = clamp(1 - Math.abs(my - h * 0.5) / (h * 0.45), 0, 1) * 0.45;
    const l = Math.max(lit * lit, along * along);
    ctx.fillStyle = WHITE;
    ctx.globalAlpha = 0.08 + l * 0.34;
    const r = (0.7 + hash(i, 36) * 0.8) * clamp(h * 0.018, 0.9, 2.4) * (1 + l * 0.7);
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The two beams. Amplitude is capped against the beam's OWN length: a crushed beam has to writhe
  // harder to read as losing, but a short one thrashing at full amplitude is a scribble, not a jet.
  const wBase = clamp(h * 0.042, 1.1, 6.5);
  for (const side of [-1, 1] as const) {
    const ax = side < 0 ? lx : rx;
    const ay = side < 0 ? ly : ry;
    const win = side < 0 ? v : -v; // + when THIS beam is the one pushing
    const push = clamp(Math.max(0, -win) / PEAK, 0, 1); // how hard THIS beam is being driven back
    const len = Math.hypot(cx - ax, cy - ay);
    const amp = Math.min(scale * 0.16, len * 0.22) * (0.75 + push * 0.85);
    const cyc = clamp(2.4 * (h / 170) ** 0.5 * (len / (w * 0.5)) ** 0.6, 0.7, 3.2);
    const color = side < 0 ? GREEN : RED;
    const seed = side < 0 ? 0.31 : 1.87;
    // Sampled against the kink count, not against the beam: a fixed step is either wasted on a lazy
    // curve or too coarse to show the corners the top octave is there to make.
    const steps = Math.round(clamp(cyc * 15, 14, 46));
    const pts: [number, number][] = [];
    for (let i = 0; i <= steps; i++) pts.push(beamAt(i / steps, ax, ay, cx, cy, amp, cyc, t, seed));
    // The compressed beam burns brighter and thicker. It is the loser that glows, not the winner:
    // this is the strain that is about to send the knot back the other way.
    drawBeam(ctx, pts, color, wBase * (1 + push * 0.45), 1 + push * 0.75);

    // Forks: a short branch peeling off the jet and dying. Each takes a slot of the loop, so a beam
    // never forks in two places at once — a jet that forks constantly reads as static, not as strain.
    for (let k = 0; k < 8; k++) {
      const born = (k / 8) * LOOP + (side < 0 ? 0 : LOOP / 16);
      const age = (((t - born) % LOOP) + LOOP) % LOOP;
      const p = span(age, 0, 260);
      if (p <= 0 || p >= 1) continue;
      const s0 = 0.35 + hash(k, side + 41) * 0.45;
      const [fx, fy] = beamAt(s0, ax, ay, cx, cy, amp, cyc, t, seed);
      const dir = hash(k, side + 42) < 0.5 ? 1 : -1;
      const reach = scale * (0.12 + hash(k, side + 43) * 0.14) * easeOut(p);
      ctx.strokeStyle = rgba(color, (1 - p) * 0.75);
      ctx.lineWidth = Math.max(0.6, wBase * 0.5);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      let px = fx;
      let py = fy;
      for (let j = 1; j <= 3; j++) {
        px += (side < 0 ? 1 : -1) * reach * 0.3 * (0.4 + hash(j, k + 44));
        py += dir * reach * 0.42 * (0.5 + hash(j, k + 45)) * (j % 2 ? 1 : -0.5);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Beads run down the LOSING beam, toward the wand that is giving ground.
    if (push > 0.12) {
      for (let k = 0; k < 3; k++) {
        const u = ((t / LOOP) * 21 + k / 3 + hash(k, side + 51)) % 1;
        const s = 1 - u * 0.9;
        const [bx, by] = beamAt(s, ax, ay, cx, cy, amp, cyc, t, seed);
        const a = push * Math.sin(Math.PI * clamp(u * 1.15, 0, 1)) * 0.9;
        blob(ctx, color, bx, by, scale * 0.075, a * 0.7);
        blob(ctx, WHITE, bx, by, scale * 0.024, a);
      }
    }
  }

  // Sparks: a welding shower, so they are paced by their OWN short cycle rather than by a slot in the
  // loop — over sixteen seconds, one-slot-per-spark would leave a single spark in the air at a time.
  // Each spark's period divides the loop exactly, which is what keeps the shower seamless at the wrap.
  // Every one of them is warm with a white core: the sparks come off the weld, not off either beam.
  const g = h * 0.0000055;
  for (let i = 0; i < 72; i++) {
    const period = LOOP / (26 + Math.floor(hash(i, 71) * 20));
    const off = hash(i, 72) * period;
    let born = Math.floor((t - off) / period) * period + off;
    const age = t - born;
    born = ((born % LOOP) + LOOP) % LOOP;
    const kick = 0.35 + strain(born) * 0.65;
    // Lives are spread wide: the short ones are the fizz that never leaves the weld, the long ones
    // are the arcs that fall away from it. One life for all of them reads as a firework, not a weld.
    const life = period * (0.2 + hash(i, 73) * 0.7);
    if (age > life) continue;
    const [ox, oy] = contact(born, w, h);
    // Thrown mostly the way the knot is being driven, the rest sideways off the seam.
    const bias = pressure(born) > 0 ? 1 : -1;
    const a = (hash(i, 74) - 0.5) * 2.8;
    const speed = scale * 0.0017 * (0.25 + hash(i, 75) ** 2 * 1.5) * kick;
    const x = ox + bias * Math.cos(a) * speed * age;
    const y = oy + Math.sin(a) * speed * age + g * age * age;
    const p = age / life;
    const sr = clamp(scale * 0.026, 0.7, 3.4) * (1 - p) * (0.45 + hash(i, 76) * 0.75);
    blob(ctx, HOT, x, y, sr * 2.8, (1 - p) * 0.7);
    blob(ctx, WHITE, x, y, sr * 0.85, (1 - p) * 0.9);
  }

  // The weld itself, over its own shower: warm halo, white core, one colour for the whole loop. Only
  // its size and brightness answer the pressure.
  const r =
    clamp(scale * 0.15, 3, 26) * (0.9 + Math.sin(TAU * 28 * (t / LOOP)) * 0.07 + heat * 0.28);
  blob(ctx, HOT, cx, cy, r * 2.6, 0.5 + heat * 0.3);
  blob(ctx, WHITE, cx, cy, r * 1.15, 0.7 + heat * 0.25);
  ctx.fillStyle = rgba(WHITE, 0.95);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.38, 0, TAU);
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';
}

export const spellclash: Concept = {
  id: 'pop-spellclash',
  nod: 'Гарри Поттер',
  title: 'Дуэль заклинаний',
  blurb:
    'Два луча входят из-за краёв и сцепляются посередине. Место стыка — сварка: белое ядро, тёплый ореол, всегда одного цвета, и оттуда постоянно летят искры. Кто побеждает — видно по лучам: продавленный горит ярче и толще, и этот накал разворачивает стык обратно. Петля 16 секунд, все наезды разной глубины и длины.',
  loopMs: LOOP,
  stillMs: 12400,
  paint,
};
