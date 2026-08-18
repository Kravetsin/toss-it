import { type Concept, blob, clamp, easeOut, hash, rgba, span, TAU } from './scene';

/**
 * CONCEPT — "the shot": a silk line fires from off-card, sticks with a splat of anchor strands, and
 * the far end SWINGS a full pendulum under it before letting go and whipping away. No figure is
 * drawn: only the line, the anchor and the bright grip, so it reads as "someone just swung past".
 *
 * Not the same thing as card-web: that one is a still web hung on the card, this one is a single
 * throw with a real arc. The loop is two mirrored halves, so the shots alternate sides.
 */

const SILK = '#e8f4ff';
const GRIP = '#ff4d5e';
const HALF = 2000;

/** Silk between two points, sampled with a perpendicular sag + a decaying transverse wobble. */
function silk(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  sag: number,
  wob: number,
  alpha: number,
  width: number,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) {
    const s = i / 16;
    const off = Math.sin(s * Math.PI) * sag + Math.sin(s * Math.PI * 3) * wob;
    const x = ax + dx * s + nx * off;
    const y = ay + dy * s + ny * off;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(SILK, alpha * 0.18);
  ctx.lineWidth = width * 3.5;
  ctx.stroke();
  ctx.strokeStyle = rgba(SILK, alpha);
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Grip position at swing progress p (0..1) — a pendulum, so it is fastest at the bottom. */
function gripAt(
  p: number,
  ax: number,
  ay: number,
  th0: number,
  th1: number,
  len: number,
): [number, number] {
  const mid = (th0 + th1) / 2;
  const amp = (th0 - th1) / 2;
  const th = mid + amp * Math.cos(p * Math.PI);
  // Reeling in at the bottom of the arc is what stops a pendulum reading as a rope on a nail.
  const l = len * (1 - 0.14 * Math.sin(p * Math.PI));
  return [ax + Math.sin(th) * l, ay + Math.cos(th) * l];
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const mirror = t >= HALF;
  const u = t - (mirror ? HALF : 0);
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.globalCompositeOperation = 'lighter';

  const ax = w * 0.74;
  const ay = h * 0.15;
  const ox = -w * 0.18;
  const oy = h * 0.98;
  const len = Math.hypot(ox - ax, oy - ay);
  const th0 = Math.atan2(ox - ax, oy - ay);
  const th1 = -th0 * 0.82; // not a mirror image: a swing loses a little of its arc
  const scale = Math.min(w, h);

  // Shot: the tip whips as it travels, because a line thrown flat is a laser, not silk.
  if (u < 160) {
    const p = easeOut(span(u, 0, 160));
    const tx = ox + (ax - ox) * p;
    const ty = oy + (ay - oy) * p;
    silk(ctx, ox, oy, tx, ty, 0, Math.sin(p * TAU) * scale * 0.05 * (1 - p), 0.9, 1.6);
    blob(ctx, SILK, tx, ty, scale * 0.05, 0.5);
  }

  // Anchor splat: strands out of the impact plus three cross-threads, so it is a web, not a knot.
  const stick = span(u, 160, 340);
  const splat = stick * (1 - span(u, 1500, 1900));
  if (splat > 0) {
    const g = easeOut(stick) * scale * 0.13;
    ctx.strokeStyle = rgba(SILK, splat * 0.75);
    ctx.lineWidth = 1.2;
    const tip: [number, number][] = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 0.4;
      const l = g * (0.6 + hash(i, 3) * 0.7);
      tip.push([ax + Math.cos(a) * l, ay + Math.sin(a) * l]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(tip[i]![0], tip[i]![1]);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(SILK, splat * 0.4);
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = tip[i]!;
      const b = tip[(i + 1) % 7]!;
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(
        (a[0] + b[0]) / 2 + (ax - (a[0] + b[0]) / 2) * 0.35,
        (a[1] + b[1]) / 2 + (ay - (a[1] + b[1]) / 2) * 0.35,
        b[0],
        b[1],
      );
    }
    ctx.stroke();
    blob(ctx, SILK, ax, ay, scale * 0.09 * (1 - stick) + scale * 0.03, splat * 0.8);
  }

  // Swing, then release: the grip keeps its tangential speed and gravity takes it off frame.
  if (u >= 160 && u < 1900) {
    const swing = span(u, 160, 1400);
    const free = span(u, 1400, 1900);
    let gx: number;
    let gy: number;
    if (free <= 0) {
      [gx, gy] = gripAt(swing, ax, ay, th0, th1, len);
    } else {
      const [bx, by] = gripAt(1, ax, ay, th0, th1, len);
      const [px, py] = gripAt(0.985, ax, ay, th0, th1, len);
      const tau = free * 500;
      gx = bx + ((bx - px) / 7.4) * tau;
      gy = by + ((by - py) / 7.4) * tau + 0.0000019 * h * tau * tau;
    }
    const hold = 1 - free;
    if (hold > 0) silk(ctx, ax, ay, gx, gy, 0, 0, 0.85 * hold, 1.7);
    else {
      // Cut silk goes slack from the anchor end and curls as it falls.
      const fade = 1 - free;
      silk(
        ctx,
        ax,
        ay,
        ax + (gx - ax) * 0.5,
        ay + (gy - ay) * 0.5 + h * 0.2 * free,
        h * 0.18 * free,
        0,
        0.5 * fade,
        1.4,
      );
    }
    // Trail: the same pose function scanned backwards — free, and it is what sells the speed.
    for (let i = 1; i <= 5; i++) {
      const back = clamp(swing - i * 0.012, 0, 1);
      const [tx, ty] = free > 0 ? [gx, gy] : gripAt(back, ax, ay, th0, th1, len);
      blob(ctx, GRIP, tx, ty, scale * 0.05 * (1 - i / 6), (1 - free) * 0.22 * (1 - i / 6));
    }
    blob(ctx, GRIP, gx, gy, scale * 0.075, 0.85 * (1 - free * 0.7));
    blob(ctx, '#ffffff', gx, gy, scale * 0.022, 0.9 * (1 - free));
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

export const thwip: Concept = {
  id: 'pop-thwip',
  nod: 'Человек-паук',
  title: 'Выстрел паутины',
  blurb:
    'Нить бьёт из-за края, прилипает кляксой из растяжек, дальний конец пролетает маятником под якорем и срывается. Фигуры нет — только нить, якорь и светящийся хват. ОТЛОЖЕН: фон из нитей и волны «чутья» сделали хуже и откачены.',
  loopMs: HALF * 2,
  stillMs: 900,
  paint,
};
