import type { CardEffectModule } from '../types';
import { mountScene, sceneHash as hash, sceneRgba as rgba } from '../canvas';

/**
 * A portal in each side of the card, throwing cubes back and forth across the whole width.
 * Eight transits per loop, alternating direction, staggered so something is always in flight.
 *
 * THE MOUTH IS A WINDOW, NOT A DISC. A linked pair shows what stands in front of the OTHER portal, so
 * each oval is clipped and filled with the far side: a hint of chamber panelling in the far portal's
 * tint, and the cubes themselves, drawn at the size their distance from the far mouth gives them. A
 * cube on its way to the orange portal visibly GROWS inside the blue one and is swallowed exactly as
 * it arrives. Nothing is simulated for this: the same flight positions draw the cube and its image.
 *
 * EVERYTHING EMITS (the blade-duel treatment): each mouth throws a wide soft wash of its own colour
 * across the card, the cube carries its own, and dust drifting the full width lights up in the colour
 * of whichever source is nearest. Black corners read as nothing; lit dust reads as a room. The washes
 * are one cached sprite scaled up — no filters, no per-pixel work.
 *
 * The cube is drawn off the real thing: slate body, four chamfered corner caps, a band in the middle
 * of each side, cyan runs to the centre pane. Its cyan keeps ONE colour for the whole flight —
 * recolouring it halfway (which an earlier version did, to match the portal it was heading for) is the
 * most conspicuous thing on the card, and it says something false: a cube does not become the portal
 * it flies toward.
 *
 * Proportions come from the game: a portal is 64x128 units, a strict 1:2 oval, so the width is derived
 * from the height and never from the card's. The rim is thin and nothing swirls inside it — vines and
 * swirls were the beta look Valve dropped in favour of the plain oval.
 */

const BLUE = '#4aa8ff';
const ORANGE = '#ff9a2b';
const BODY = '#8e9bb0'; // the cube's slate body
const SHELL = '#e4e6ea'; // its corner caps and mid-side bands
const DARK = '#0d1117'; // the outlines that give it its game-asset read
const IRIS = '#9aa1a8'; // the blades of the centre pane
const RING = '#5fd8ff'; // the cyan runs from the pane to each band
const LOOP = 3600;
const GAP = 450; // 8 launches per loop
const TRANSIT = 980;
const BURST = 340;
const TAIL = 320; // ms of path the cube's trail covers

const TAU = Math.PI * 2;

/** 0..1 progress of `t` through a window, clamped. */
function span(t: number, from: number, to: number): number {
  const v = (t - from) / (to - from);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
/** A burst spends its impulse immediately and then settles. */
const easeOut = (t: number): number => 1 - (1 - t) ** 3;

const glows = new Map<string, HTMLCanvasElement>();
/** Soft halo sprite, cached per colour — cheaper than a gradient per spark. */
function blob(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  r: number,
  a = 1,
): void {
  if (r <= 0 || a <= 0) return;
  let sprite = glows.get(color);
  if (!sprite) {
    const n = parseInt(color.slice(1), 16);
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    const rgbTriplet = [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
    grad.addColorStop(0, `rgba(${rgbTriplet},0.85)`);
    grad.addColorStop(0.3, `rgba(${rgbTriplet},0.35)`);
    grad.addColorStop(1, `rgba(${rgbTriplet},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 48, 48);
    glows.set(color, c);
    sprite = c;
  }
  ctx.globalAlpha = a;
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

interface Flight {
  i: number;
  tau: number;
  toRight: boolean;
  x: number;
  y: number;
}

const spills = new Map<string, HTMLCanvasElement>();
/** A very soft, very wide falloff — the light a source throws on the room, not a second glow. */
function spill(color: string): HTMLCanvasElement {
  const hit = spills.get(color);
  if (hit) return hit;
  const n = parseInt(color.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  // The energy lives in the far falloff. A tight bright core here competes with the source itself.
  grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.24)`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},0.08)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  spills.set(color, c);
  return c;
}
function drawSpill(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  rw: number,
  rh: number,
  a: number,
): void {
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a;
  // Wide and flat, not a disc: a round wash at this strength reads as a haze blob sitting on the
  // card, while a stretched one reads as a room that happens to be lit from that side.
  ctx.drawImage(spill(color), x - rw, y - rh, rw * 2, rh * 2);
  ctx.globalAlpha = 1;
}

/** Where a launch is at progress u — one arc, used by the cube, its trail and its image alike. */
function arc(
  i: number,
  toRight: boolean,
  lx: number,
  rxp: number,
  yc: number,
  h: number,
  u: number,
): [number, number] {
  const from = toRight ? lx : rxp;
  const to = toRight ? rxp : lx;
  // Bow varies per launch, so eight transits along one line never become a conveyor belt.
  const bow = (hash(i, 1) * 0.3 + 0.12) * (i % 4 < 2 ? -1 : 1);
  const c = Math.min(1, Math.max(0, u));
  return [from + (to - from) * c, yc + bow * h * (1 - 4 * (c - 0.5) ** 2)];
}

/**
 * The storage cube, face-on, off the reference: a slate body; four light corner caps chamfered toward
 * the middle (which is what leaves the body reading as an octagon); a light band in the middle of each
 * side; four cyan lines from the centre out to those bands; and the round centre pane with its iris.
 *
 * Detail is dropped by SIZE, not by surface: the same cube is 26px on a card and 8px on a chat row,
 * and an iris drawn at 8px is mud. Below the thresholds the pane becomes a plain lit disc, which is
 * what the silhouette needs anyway — the cross and the caps are what make it this cube.
 */
function drawCube(ctx: CanvasRenderingContext2D, s: number): void {
  const half = s / 2;
  const cap = s * 0.3; // corner cap
  const band = s * 0.13; // depth of the mid-side bands
  const pane = s * 0.23; // radius of the centre pane
  const line = Math.max(0.5, s * 0.045);

  ctx.fillStyle = rgba(BODY, 0.95);
  ctx.fillRect(-half, -half, s, s);
  ctx.strokeStyle = rgba(DARK, 0.9);
  ctx.lineWidth = line;
  ctx.strokeRect(-half, -half, s, s);

  // The cyan runs, centre to each band. Under the caps and bands, over the body.
  ctx.strokeStyle = rgba(RING, 0.95);
  ctx.lineWidth = Math.max(0.8, s * 0.06);
  ctx.beginPath();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as [number, number][]) {
    ctx.moveTo(dx * pane * 0.6, dy * pane * 0.6);
    ctx.lineTo(dx * half, dy * half);
  }
  ctx.stroke();

  // Corner caps: a square with the inner corner cut off, one per corner.
  ctx.fillStyle = rgba(SHELL, 0.96);
  ctx.strokeStyle = rgba(DARK, 0.9);
  ctx.lineWidth = line;
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as [number, number][]) {
    const x0 = sx * half;
    const y0 = sy * half;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 - sx * cap, y0);
    ctx.lineTo(x0 - sx * cap, y0 - sy * cap * 0.42);
    ctx.lineTo(x0 - sx * cap * 0.42, y0 - sy * cap);
    ctx.lineTo(x0, y0 - sy * cap);
    ctx.closePath();
    ctx.fill();
    if (s > 9) ctx.stroke();
  }

  // Mid-side bands.
  for (const [dx, dy] of [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ] as [number, number][]) {
    const long = s * 0.3;
    const w = dx ? band : long;
    const hgt = dx ? long : band;
    const x0 = dx * (half - band / 2) - w / 2;
    const y0 = dy * (half - band / 2) - hgt / 2;
    ctx.beginPath();
    ctx.rect(x0, y0, w, hgt);
    ctx.fill();
    if (s > 9) ctx.stroke();
  }

  // Centre pane: dark rim, light disc, and — only when there are pixels for it — the iris.
  ctx.beginPath();
  ctx.arc(0, 0, pane, 0, TAU);
  ctx.fillStyle = rgba(SHELL, 0.96);
  ctx.fill();
  ctx.strokeStyle = rgba(DARK, 0.95);
  ctx.lineWidth = Math.max(0.6, s * 0.05);
  ctx.stroke();
  if (s > 16) {
    ctx.fillStyle = rgba(IRIS, 0.95);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * pane * 0.9, Math.sin(a) * pane * 0.9);
      ctx.lineTo(Math.cos(a + 1.1) * pane * 0.85, Math.sin(a + 1.1) * pane * 0.85);
      ctx.lineTo(Math.cos(a + 0.5) * pane * 0.16, Math.sin(a + 0.5) * pane * 0.16);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.arc(0, 0, pane * 0.55, 0, TAU);
    ctx.fillStyle = rgba(IRIS, 0.9);
    ctx.fill();
  }
}

function drawPortal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  far: string,
  farX: number,
  dirIn: number,
  t: number,
  flare: number,
  flights: Flight[],
  side: number,
  h: number,
): void {
  ctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.clip();
  ctx.fillStyle = 'rgba(4,7,12,0.78)';
  ctx.fill();
  // The far side: a floor line and a panel seam, lit by the far portal. Two strokes are enough — the
  // eye only needs to be told that this is somewhere else, not shown a room.
  ctx.strokeStyle = rgba(far, 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - rx, y + ry * 0.42);
  ctx.lineTo(x + rx, y + ry * 0.36);
  ctx.moveTo(x - dirIn * rx * 0.35, y - ry);
  ctx.lineTo(x - dirIn * rx * 0.35, y + ry * 0.4);
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(far, 0.06 + flare * 0.08);
  ctx.fillRect(x - rx, y - ry, rx * 2, ry * 2);
  // The cubes, seen through. The VANISHING POINT is the middle of the oval: something far away sits
  // there, small, and as it nears the far mouth it grows AND drifts away from that point, out through
  // the side of the frame — left in the left portal, right in the right one, because that is the
  // direction the hole recedes in. The first version had it backwards (images converging on the
  // centre as they arrived), which reads as falling in rather than coming at you.
  //
  // THE IMAGE ARRIVES AT THE CENTRE, and that is not a matter of taste: the real cube materialises at
  // the middle of the mouth, so an image that finishes anywhere else leaves a visible jump between the
  // two. Far images therefore sit out toward the receding side of the hole and converge inward as they
  // grow. (An earlier pass had them drifting outward on arrival, which looked right in isolation and
  // disagreed with the cube popping out of the centre a moment later.)
  //
  // AND IT ARRIVES AT LIFE SIZE. A window is a hole, not a lens: an object AT the mouth subtends
  // exactly the size it really is, so the image has to hand over to the real cube at 1:1. It was
  // drawn 3x too big to make it spill past the frame, which is a different (and wrong) idea.
  //
  // DEPTH HAS TO BE STEEP, or the window turns to mush. An earlier version fell off over most of the
  // card (a cube halfway across still drew BIGGER than the real one) and every cube in flight landed
  // in the frame at a competing size. Real perspective is 1/distance: the falloff is over a third of
  // the card, size goes to zero rather than to a floor, and the image fades with it — so a window
  // holds ONE arriving cube plus specks. The two nearest are drawn and the rest are skipped outright.
  const seen = flights
    .map((f) => ({ f, s: 1 / (1 + Math.abs(f.x - farX) / (h * 0.28)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 2);
  for (const { f, s } of seen) {
    const size = side * s ** 1.4;
    if (size < 1.5) continue;
    ctx.save();
    ctx.translate(x + dirIn * rx * 1.7 * (1 - s) ** 1.4, y + (f.y - y) * s * 0.6);
    ctx.rotate(s * 2.4 * dirIn);
    ctx.globalAlpha = 0.25 + s * 0.75;
    drawCube(ctx, size);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.strokeStyle = rgba(color, 0.5 + flare * 0.3);
  ctx.lineWidth = Math.max(2.5, ry * 0.14);
  ctx.stroke();
  ctx.strokeStyle = rgba('#ffffff', 0.75 + flare * 0.25);
  ctx.lineWidth = Math.max(1, ry * 0.045);
  ctx.stroke();
  // Mist around the rim: fourteen motes, each on its own orbit, so the ring reads as charged rather
  // than as a dashed border going round.
  //
  // WHOLE LAPS PER LOOP, and the same for the in-and-out wobble. Anything paced in its own free time
  // (a plain `t / 700`) lands mid-turn when the loop wraps and every mote snaps back to its start at
  // once — the one visible seam in the whole scene. Periodicity is not optional here, only the number
  // of laps and their direction are.
  const cycle = t / LOOP;
  for (let k = 0; k < 14; k++) {
    const laps = (1 + Math.floor(hash(k, 13) * 3)) * (k % 2 ? -1 : 1);
    const a = hash(k, 12) * TAU + cycle * laps * TAU;
    const bobs = 1 + Math.floor(hash(k, 15) * 3);
    const r = 0.9 + Math.sin((cycle * bobs + hash(k, 16)) * TAU) * 0.16;
    const mx = x + Math.cos(a) * rx * r;
    const my = y + Math.sin(a) * ry * r;
    // A SOLID CORE, with the halo kept just wider than it. These were a pure blur sprite scaled to a
    // tenth of the mouth — at ~10px across with no hard pixel anywhere, which does not read as a spark
    // but as a badly upscaled image. A speck needs an edge. Its size is nearly independent of the
    // surface too (clamped, not scaled): dust looks the same size wherever you stand.
    const core = Math.max(0.7, Math.min(2.2, ry * 0.035)) * (0.7 + hash(k, 14) * 0.6);
    blob(ctx, color, mx, my, core * 2.4, 0.28 + flare * 0.22);
    ctx.fillStyle = rgba(k % 3 === 0 ? '#ffffff' : color, 0.85 + flare * 0.15);
    ctx.beginPath();
    ctx.arc(mx, my, core, 0, TAU);
    ctx.fill();
  }
}

/** Bound to the equipped pair (or the defaults) and handed to the host as the scene's paint. */
function scene(BLUE: string, ORANGE: string) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void =>
    paint(ctx, w, h, t, BLUE, ORANGE);
}

function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  BLUE: string,
  ORANGE: string,
): void {
  const ry = h * 0.36;
  const rx = ry * 0.5;
  const yc = h * 0.5;
  const lx = rx * 1.35;
  const rxp = w - rx * 1.35;
  const side = Math.max(5, Math.min(26, h * 0.2));

  // Flare each mouth by its own traffic: a launch charges the exit, an arrival hits the entry.
  let flareL = 0;
  let flareR = 0;
  const flights: Flight[] = [];
  for (let i = 0; i < LOOP / GAP; i++) {
    let tau = t - i * GAP;
    if (tau < 0) tau += LOOP;
    const toRight = i % 2 === 0;
    const out = Math.exp(-Math.abs(tau) / 150);
    const inn = Math.exp(-Math.abs(tau - TRANSIT) / 150);
    if (toRight) {
      flareL = Math.max(flareL, out);
      flareR = Math.max(flareR, inn);
    } else {
      flareR = Math.max(flareR, out);
      flareL = Math.max(flareL, inn);
    }
    if (tau > TRANSIT + BURST) continue;
    const [x, y] = arc(i, toRight, lx, rxp, yc, h, tau / TRANSIT);
    flights.push({ i, tau, toRight, x, y });
  }
  const inFlight = flights.filter((f) => f.tau >= 0 && f.tau <= TRANSIT);

  // Light first, so everything else sits IN it. Each mouth lights its own end of the card; the cubes
  // light the middle, which is exactly the stretch neither portal reaches.
  drawSpill(ctx, BLUE, lx, yc, w * 0.42, h * 1.9, 0.42 + flareL * 0.2);
  drawSpill(ctx, ORANGE, rxp, yc, w * 0.42, h * 1.9, 0.42 + flareR * 0.2);
  for (const f of inFlight) drawSpill(ctx, RING, f.x, f.y, h * 0.85, h * 0.85, 0.3);

  // Dust across the FULL width, taking the colour of whichever source is nearest. Its size barely
  // scales: a mote sized off the card's height vanishes into antialiasing on a 40px row.
  ctx.globalCompositeOperation = 'lighter';
  const reach = h * 0.75;
  for (let i = 0; i < 26; i++) {
    const laps = (1 + Math.floor(hash(i, 21) * 2)) * (hash(i, 22) < 0.5 ? 1 : -1);
    const mx = ((((hash(i, 23) + (t / LOOP) * laps) % 1) + 1) % 1) * w;
    const my = (hash(i, 24) * 0.92 + 0.04 + Math.sin((t / LOOP + hash(i, 25)) * TAU) * 0.05) * h;
    let lit = 0;
    let tint = '#9aa0ab';
    for (const [sx, sy, color] of [
      [lx, yc, BLUE],
      [rxp, yc, ORANGE],
      ...inFlight.map((f) => [f.x, f.y, RING] as [number, number, string]),
    ] as [number, number, string][]) {
      const l = Math.max(0, 1 - Math.hypot(mx - sx, my - sy) / reach);
      if (l > lit) {
        lit = l;
        tint = color;
      }
    }
    ctx.fillStyle = tint;
    ctx.globalAlpha = 0.12 + lit * lit * 0.5;
    const r = (0.75 + hash(i, 26) * 0.75) * Math.max(1, Math.min(2.6, h * 0.018)) * (1 + lit);
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  drawPortal(ctx, lx, yc, rx, ry, BLUE, ORANGE, rxp, -1, t, flareL, inFlight, side, h);
  drawPortal(ctx, rxp, yc, rx, ry, ORANGE, BLUE, lx, 1, t, flareR, inFlight, side, h);
  ctx.globalCompositeOperation = 'lighter';

  for (const f of flights) {
    const { i, tau, toRight } = f;
    const src = toRight ? BLUE : ORANGE;
    const dst = toRight ? ORANGE : BLUE;
    const s = tau / TRANSIT;
    if (s >= 0 && s <= 1) {
      // Trail: the arc the cube has just flown, drawn as separate quads so each carries its OWN
      // alpha. One filled ribbon reads as a shape stuck to the card instead of light dissipating.
      const steps = 14;
      let px = 0;
      let py = 0;
      for (let k = 0; k <= steps; k++) {
        const back = (k / steps) * (TAIL / TRANSIT);
        const [x, y] = arc(i, toRight, lx, rxp, yc, h, s - back);
        if (k > 0) {
          const fade = (1 - k / steps) ** 1.6;
          const wq = side * 0.42 * fade;
          const dx = x - px;
          const dy = y - py;
          const len = Math.hypot(dx, dy) || 1;
          const nx = (-dy / len) * wq;
          const ny = (dx / len) * wq;
          ctx.fillStyle = rgba(RING, 0.5 * fade);
          ctx.beginPath();
          ctx.moveTo(px + nx, py + ny);
          ctx.lineTo(x + nx, y + ny);
          ctx.lineTo(x - nx, y - ny);
          ctx.lineTo(px - nx, py - ny);
          ctx.closePath();
          ctx.fill();
        }
        px = x;
        py = y;
      }
      blob(ctx, RING, f.x, f.y, side * 1.5, 0.4);
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(s * TAU * 2 * (toRight ? 1 : -1));
      ctx.globalCompositeOperation = 'source-over';
      drawCube(ctx, side);
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
    }

    // Exit spray: thrown FORWARD out of the mouth, with drag. Entry splash: thrown BACK out of it.
    // Each spark is a coloured halo plus a white centre, or it reads as a dim smudge at this size.
    for (const [ev, at0, color, dir] of [
      [0, toRight ? lx : rxp, src, toRight ? 1 : -1],
      [TRANSIT, toRight ? rxp : lx, dst, toRight ? -1 : 1],
    ] as [number, number, string, number][]) {
      const p = span(tau, ev, ev + BURST);
      if (p <= 0 || p >= 1) continue;
      const e = easeOut(p);
      for (let k = 0; k < 12; k++) {
        const spread = (hash(k, i + 2) - 0.5) * 1.5;
        const d = e * h * (0.35 + hash(k, i + 5) * 0.55);
        const sx = at0 + dir * d * Math.cos(spread);
        const sy = yc + d * Math.sin(spread) * 0.9;
        const r = side * 0.4 * (1 - p);
        blob(ctx, color, sx, sy, r, (1 - p) * 1.1);
        blob(ctx, '#ffffff', sx, sy, r * 0.4, (1 - p) * 0.9);
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function render(
  layer: HTMLElement,
  _surface: unknown,
  _compact: unknown,
  color?: string,
  color2?: string,
): (() => void) | void {
  if (typeof document === 'undefined') return;
  // One upgrade, two pickers: the pair is only legible because the two mouths differ, so each keeps
  // its own colour. The cube stays its own — it belongs to neither side (see the header).
  const paintPair = scene(color || BLUE, color2 || ORANGE);
  return mountScene(layer, 'card-portals', paintPair, { loopMs: LOOP, stillMs: 700, maxLive: 6 });
}

export const cardPortals: CardEffectModule = {
  id: 'card-portals',
  type: 'card_effect',
  costDust: 5000,
  since: '2026-08-18',
  className: 'card-fx-portals',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  colorUpgrade: 'card-portals-color',
  dualColor: true,
  labels: { name: 'shop.cardPortals', desc: 'shop.cardPortalsDesc' },
  render,
};
