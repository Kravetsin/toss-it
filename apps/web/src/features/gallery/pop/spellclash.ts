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
 * PRESSURE BUILDS, THEN BREAKS. The push uses easeIn — it ACCELERATES into the moment it gives way —
 * and the recoil easeOut, spent instantly and settling. A sine back and forth is a metronome; a duel
 * is a slow lean followed by a snap. The break is also the only moment anything flashes.
 *
 * THE BEAM IS A ROPE WITH KINKS, NOT A BOLT. Offsets are a sum of sines scrolling along the beam, at
 * WHOLE cycles per loop (anything paced in its own free time snaps back visibly when the loop wraps),
 * with the top frequency close to the sample rate so the polyline aliases into hard corners — that is
 * what reads as lightning. Amplitude is anchored to zero at both ends: a jet is held at the wand tip
 * and welded at the contact, and it writhes in between. The SHORTER (losing) beam writhes harder.
 *
 * The beads sliding down the losing beam are the one detail taken from the source's actual mechanic
 * rather than from a memory of the scene: the beads run toward the loser, and they turn around when
 * the pressure does.
 */

const GREEN = '#55ff9e';
const RED = '#ff4b4b';
const WHITE = '#ffffff';
const LOOP = 5200;

/** Where the contact sits, as a fraction of the card's width off centre. + = the left beam is winning. */
interface Beat {
  at: number;
  to: number;
  ease: (t: number) => number;
}
const BEATS: Beat[] = [
  { at: 0, to: 0.02, ease: easeInOut },
  { at: 700, to: 0.05, ease: easeInOut }, // guard: neither side has it yet
  { at: 1960, to: 0.3, ease: easeIn }, // the lean — accelerating into the break
  { at: 2200, to: 0.04, ease: easeOut }, // it gives; the knot snaps back through the middle
  { at: 2860, to: -0.05, ease: easeInOut },
  { at: 4120, to: -0.3, ease: easeIn },
  { at: 4360, to: -0.04, ease: easeOut },
  { at: LOOP, to: 0.02, ease: easeInOut },
];
/** The two instants pressure breaks — the only flashes in the loop. */
const BREAKS = [1960, 4120];

/** Signed pressure at `t`: -1..1, + means the left beam is pushing the contact toward the right edge. */
function pressure(t: number): number {
  let prev = BEATS[0]!;
  for (let i = 1; i < BEATS.length; i++) {
    const b = BEATS[i]!;
    if (t <= b.at) return prev.to + (b.to - prev.to) * b.ease(span(t, prev.at, b.at));
    prev = b;
  }
  return prev.to;
}

/** How hard the last break is still ringing at `t` — drives every flash, flare and spray. */
function flash(t: number): number {
  let f = 0;
  for (const b of BREAKS) {
    const d = t - b;
    if (d >= 0) f = Math.max(f, Math.exp(-d / 170));
  }
  return f;
}

/** The contact point at `t`. A pure function of time, so a spark born earlier can ask where it came from. */
function contact(t: number, w: number, h: number): [number, number] {
  const v = pressure(t);
  const u = t / LOOP;
  // Tremble: two locked beams never sit still, and the harder they are leaning the worse it shakes.
  const shake = (0.25 + Math.abs(v) * 2.2) * (1 - flash(t) * 0.5);
  const x = w * (0.5 + v) + Math.sin(TAU * (11 * u)) * w * 0.006 * shake;
  const y =
    h * 0.5 +
    Math.sin(TAU * (2 * u + 0.2)) * h * 0.05 +
    Math.sin(TAU * (13 * u)) * h * 0.012 * shake;
  return [x, y];
}

/**
 * A point on a beam, `s` from the wand tip (0) to the contact (1). Sampled by the stroke, by the
 * beads and by the forks alike, so nothing ever floats beside the beam it belongs to.
 */
function beamAt(
  s: number,
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  amp: number,
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
    Math.sin(TAU * (2.3 * s + 3 * u + seed)) * 0.5 +
    Math.sin(TAU * (5.1 * s - 5 * u + seed * 1.7)) * 0.28 +
    Math.sin(TAU * (9.7 * s + 8 * u + seed * 2.3)) * 0.16 +
    Math.sin(TAU * (17.3 * s - 13 * u + seed * 3.1)) * 0.07;
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
  const f = flash(t);
  const [cx, cy] = contact(t, w, h);
  const scale = Math.min(h, w * 0.45);
  const edge = Math.max(5, h * 0.07);
  // The wands are off-card on purpose: what is drawn is the light between them, not the duellists.
  const lx = -edge;
  const ly = h * 0.5 + h * 0.05;
  const rx = w + edge;
  const ry = h * 0.5 - h * 0.05;

  ctx.globalCompositeOperation = 'lighter';

  // Light first, so the beams sit IN it. Each wand lights its own end; the knot lights the middle.
  blob(ctx, GREEN, lx, ly, h * 1.5, 0.16 + Math.max(0, v) * 0.1);
  blob(ctx, RED, rx, ry, h * 1.5, 0.16 + Math.max(0, -v) * 0.1);
  blob(ctx, GREEN, cx, cy, h * (1.3 + f * 0.5), 0.14 + Math.max(0, v) * 0.12 + f * 0.1);
  blob(ctx, RED, cx, cy, h * (1.3 + f * 0.5), 0.14 + Math.max(0, -v) * 0.12 + f * 0.1);

  // Dust: motes drifting the full width, tinted by whichever source is nearest. Nearly size-locked,
  // because a mote scaled off the card's height disappears into antialiasing on a 40px row.
  const reach = h * 0.9;
  for (let i = 0; i < 22; i++) {
    const laps = (1 + Math.floor(hash(i, 31) * 2)) * (hash(i, 32) < 0.5 ? 1 : -1);
    const mx = ((((hash(i, 33) + (t / LOOP) * laps * 0.35) % 1) + 1) % 1) * w;
    const my = (hash(i, 34) * 0.9 + 0.05 + Math.sin((t / LOOP + hash(i, 35)) * TAU) * 0.05) * h;
    const lit = clamp(1 - Math.hypot(mx - cx, my - cy) / reach, 0, 1);
    // Away from the knot a mote still catches the beam it is closest to, so the corners aren't dead.
    const along = clamp(1 - Math.abs(my - h * 0.5) / (h * 0.45), 0, 1) * 0.45;
    const l = Math.max(lit * lit, along * along);
    ctx.fillStyle = mx < cx ? GREEN : RED;
    ctx.globalAlpha = 0.1 + l * 0.55 + f * l * 0.2;
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
    const len = Math.hypot(cx - ax, cy - ay);
    const amp = Math.min(scale * 0.16, len * 0.22) * (0.75 + Math.max(0, -win) * 0.85);
    const color = side < 0 ? GREEN : RED;
    const seed = side < 0 ? 0.31 : 1.87;
    const pts: [number, number][] = [];
    for (let i = 0; i <= 30; i++) pts.push(beamAt(i / 30, ax, ay, cx, cy, amp, t, seed));
    drawBeam(ctx, pts, color, wBase * (1 + win * 0.35), 1 + win * 0.25 + f * 0.3);

    // Forks: a short branch peeling off the jet and dying. Each takes a slot of the loop, so at most
    // one per beam is alive at a time — a jet that forks constantly reads as static, not as strain.
    for (let k = 0; k < 3; k++) {
      const born = (k / 3) * LOOP + (side < 0 ? 0 : LOOP / 6);
      const age = (((t - born) % LOOP) + LOOP) % LOOP;
      const p = span(age, 0, 260);
      if (p <= 0 || p >= 1) continue;
      const s0 = 0.35 + hash(k, side + 41) * 0.45;
      const [fx, fy] = beamAt(s0, ax, ay, cx, cy, amp, t, seed);
      const dir = hash(k, side + 42) < 0.5 ? 1 : -1;
      const reachF = scale * (0.12 + hash(k, side + 43) * 0.14) * easeOut(p);
      ctx.strokeStyle = rgba(color, (1 - p) * 0.75);
      ctx.lineWidth = Math.max(0.6, wBase * 0.5);
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      let px = fx;
      let py = fy;
      for (let j = 1; j <= 3; j++) {
        px += (side < 0 ? 1 : -1) * reachF * 0.3 * (0.4 + hash(j, k + 44));
        py += dir * reachF * 0.42 * (0.5 + hash(j, k + 45)) * (j % 2 ? 1 : -0.5);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Beads run down the LOSING beam, toward the wand that is giving ground.
    if (win < -0.04) {
      const grip = clamp(-win / 0.3, 0, 1);
      for (let k = 0; k < 3; k++) {
        const u = ((t / LOOP) * 7 + k / 3 + hash(k, side + 51)) % 1;
        const s = 1 - u * 0.9;
        const [bx, by] = beamAt(s, ax, ay, cx, cy, amp, t, seed);
        const a = grip * Math.sin(Math.PI * clamp(u * 1.15, 0, 1)) * 0.9;
        blob(ctx, color, bx, by, scale * 0.075, a * 0.7);
        blob(ctx, WHITE, bx, by, scale * 0.024, a);
      }
    }
  }

  // The knot: both energies present at once (never a blended third colour — the whole point is that
  // two powers are touching), a white core, and spikes so it reads as a star rather than a dot.
  const r = clamp(scale * 0.15, 3, 26) * (0.9 + Math.sin(TAU * 9 * (t / LOOP)) * 0.08 + f * 0.55);
  blob(ctx, GREEN, cx, cy, r * (2.6 + f), 0.4 + Math.max(0, v) * 0.3);
  blob(ctx, RED, cx, cy, r * (2.6 + f), 0.4 + Math.max(0, -v) * 0.3);
  blob(ctx, WHITE, cx, cy, r * 1.35, 0.55 + f * 0.4);
  ctx.strokeStyle = rgba(WHITE, 0.55 + f * 0.35);
  ctx.lineWidth = Math.max(0.7, wBase * 0.55);
  ctx.beginPath();
  for (let k = 0; k < 7; k++) {
    const a = hash(k, 61) * TAU + (t / LOOP) * TAU * (k % 2 ? 1 : -1);
    const l = r * (1.3 + hash(k, 62) * 1.6) * (1 + f);
    ctx.moveTo(cx + Math.cos(a) * r * 0.4, cy + Math.sin(a) * r * 0.4);
    ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l);
  }
  ctx.stroke();
  ctx.fillStyle = rgba(WHITE, 0.95);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.42, 0, TAU);
  ctx.fill();

  // Shock ring at each break, drawn where the contact WAS at that instant — the ring stays put while
  // the knot snaps away from it, which is what makes the recoil read as the knot losing the ground.
  for (const b of BREAKS) {
    const p = span(t - b, 0, 420);
    if (p <= 0 || p >= 1) continue;
    const [bx, by] = contact(b, w, h);
    const e = easeOut(p);
    ctx.strokeStyle = rgba(pressure(b) > 0 ? GREEN : RED, (1 - p) * 0.55);
    ctx.lineWidth = Math.max(0.8, wBase * 0.9 * (1 - p));
    ctx.beginPath();
    ctx.ellipse(bx, by, r * (0.8 + e * 5), r * (0.8 + e * 3.4), 0, 0, TAU);
    ctx.stroke();
  }

  // Sparks. A steady drip off the knot, plus a spray at each break; both are born at the contact
  // point of their OWN birth time, so a spark never trails from where the knot happens to be now.
  const g = h * 0.0000055;
  for (let i = 0; i < 26; i++) {
    const burst = i >= 14;
    const born = burst ? BREAKS[i % 2]! : ((i / 14) * LOOP + hash(i, 71) * (LOOP / 14)) % LOOP;
    const life = burst ? 620 : 520;
    const age = (((t - born) % LOOP) + LOOP) % LOOP;
    if (age > life) continue;
    const [ox, oy] = contact(born, w, h);
    const dir = hash(i, 72) < 0.5 ? -1 : 1;
    // A break throws its spray BACKWARD, the way the beam that gave out is being driven.
    const bias = burst ? (pressure(born) > 0 ? 1 : -1) : dir;
    const a = (hash(i, 73) - 0.5) * (burst ? 1.5 : 2.4);
    const speed = scale * (burst ? 0.0022 : 0.0013) * (0.5 + hash(i, 74));
    const x = ox + bias * Math.cos(a) * speed * age;
    const y = oy + Math.sin(a) * speed * age + g * age * age;
    const p = age / life;
    const sr = clamp(scale * 0.03, 0.8, 4) * (1 - p);
    blob(ctx, ox < w * 0.5 ? GREEN : RED, x, y, sr * 2.6, (1 - p) * 0.75);
    blob(ctx, WHITE, x, y, sr, (1 - p) * 0.9);
  }

  // The break lights the whole card for an instant. Kept far below what it wants to be: this fires
  // twice a loop on every card in a list, and a real flash there is a strobe.
  if (f > 0.01) {
    ctx.fillStyle = rgba(pressure(t) > 0 ? GREEN : RED, f * 0.05);
    ctx.fillRect(0, 0, w, h);
  }

  ctx.globalCompositeOperation = 'source-over';
}

export const spellclash: Concept = {
  id: 'pop-spellclash',
  nod: 'Гарри Поттер',
  title: 'Дуэль заклинаний',
  blurb:
    'Два луча входят из-за краёв и сцепляются посередине. Узел светит и сыплет искрами, лучи всё время перекручиваются как молния, по проигрывающему лучу к его хозяину бегут бусины. Давление копится, срывается вспышкой и уходит в другую сторону — и так по кругу.',
  loopMs: LOOP,
  stillMs: 1780,
  paint,
};
