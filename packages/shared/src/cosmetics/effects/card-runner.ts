import type { CardEffectModule, Surface } from '../types';
import { mountScene, sceneHash as hash, sceneLighten, sceneRgba as rgba } from '../canvas';

/**
 * An endless runner: a cube sprints along the card's bottom edge, vaults the spikes with a half-turn
 * and lands in a puff of dust while the world scrolls past on a seamless loop. The look is NEON —
 * everything luminous is a wide soft halo around a white-hot core: the floor line, the spike
 * outlines over translucent bodies, the cube's edge. Two palettes, sold as ONE dual upgrade:
 * colour 1 is the cube (the viewer), colour 2 is the world (floor + spikes — one level, one hue).
 *
 * Everything about the pose is a PURE function of loop time: the obstacle course is laid once per
 * box size, every jump window is derived from where its obstacle passes the cube, and the ghost
 * trail just re-evaluates the same pose a few ms in the past. That is what makes the reduced-motion
 * still a real mid-flight frame — the first obstacle is PINNED so the cube is always airborne at
 * STILL ms, whatever the box.
 *
 * Sizing follows the two axes separately: travel spans the full WIDTH (which is why this scene is
 * the one that reads best on a low chat row), the cube and ground follow HEIGHT, and the obstacle
 * cadence is temporal (~1.4 s apart), so a wide box gets wider spacing, not more clutter. Star and
 * ground-tick drifts are locked to a whole number of passes per loop, so the wrap is invisible.
 *
 * COST: ~40 fills/strokes a frame, no gradients outside the one cached halo sprite per colour.
 */

const LOOP = 8000;
const SECS = LOOP / 1000;
const STILL = 1200;
const MINT = '#8df0cc';
/** Default world colour. The DUAL upgrade sells two pickers: colour 1 the cube, colour 2 the world
 *  (floor and spikes together — they are one level, splitting them would sell three pickers). */
const OBST = '#f2a65a';

interface Layout {
  v: number; // scroll speed, px/s
  cl: number; // course length, px — exactly v * SECS, so the wrap seam is invisible
  s: number; // cube side
  gy: number; // ground line y
  x0: number; // the cube's fixed x
  tickGap: number;
  obs: { px: number; block: boolean; dbl: boolean }[];
  jumps: { tj: number; dur: number }[];
  stars: { sx: number; sy: number; r: number; passes: number; a: number }[];
}

/** Keyed by box size: the shop preview and a live card can run different sizes at once. */
const layouts = new Map<string, Layout>();

function layoutFor(w: number, h: number): Layout {
  const key = `${w}x${h}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const v = Math.max(150, Math.min(380, w * 0.55));
  const cl = v * SECS;
  const s = Math.max(9, Math.min(26, h * 0.24));
  const gy = h - Math.max(5, Math.min(22, h * 0.16));
  const x0 = w * 0.22;
  // Ticks must complete whole passes per loop or the ground stutters at the wrap.
  const tickGap = cl / Math.max(1, Math.round(cl / (s * 2.4)));
  const obs: Layout['obs'] = [];
  const jumps: Layout['jumps'] = [];
  // First pass time pinned at 1.2 s: it puts the apex of a jump exactly under the still frame.
  let tp = STILL / 1000;
  for (let i = 0; tp < SECS - 1; i++) {
    const dbl = hash(i, 5) < 0.28;
    const dur = dbl ? 0.72 : 0.56;
    obs.push({ px: (x0 + v * tp) % cl, block: hash(i, 6) < 0.4, dbl });
    jumps.push({ tj: (tp - dur * 0.52 + SECS) % SECS, dur });
    tp += 1.05 + hash(i, 7) * 0.75;
  }
  const stars: Layout['stars'] = [];
  const n = Math.max(10, Math.min(40, Math.round((w * (gy - s)) / 3400)));
  for (let i = 0; i < n; i++) {
    const par = 0.35 + hash(i, 11) * 0.65;
    stars.push({
      sx: hash(i, 12) * w,
      sy: hash(i, 13) * Math.max(2, gy - s * 1.6),
      r: 1 + hash(i, 14),
      passes: Math.max(1, Math.round((v * 0.12 * par * SECS) / w)),
      a: 0.08 + par * 0.14,
    });
  }
  const built: Layout = { v, cl, s, gy, x0, tickGap, obs, jumps, stars };
  if (layouts.size > 12) layouts.clear();
  layouts.set(key, built);
  return built;
}

let haloSprites: Map<string, HTMLCanvasElement> | undefined;
/** Soft glow under the cube, cached per colour — one gradient build, then a drawImage per frame. */
function halo(color: string): HTMLCanvasElement {
  haloSprites ??= new Map();
  const hit = haloSprites.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, rgba(color, 0.2));
  grad.addColorStop(0.45, rgba(color, 0.08));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  haloSprites.set(color, c);
  return c;
}

/** Jump phase at `ts` (0..1, or -1 on the ground), checked across the loop seam. */
function jumpPhase(L: Layout, ts: number): number {
  for (const j of L.jumps) {
    for (const off of [0, SECS]) {
      const lt = ts + off - j.tj;
      if (lt >= 0 && lt <= j.dur) return lt / j.dur;
    }
  }
  return -1;
}

function scene(base: string, obst: string) {
  const edge = sceneLighten(base, 0.8);
  return (ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void => {
    const L = layoutFor(w, h);
    const ts = t / 1000;

    for (const st of L.stars) {
      const x = (((st.sx - (ts / SECS) * st.passes * w) % w) + w) % w;
      ctx.fillStyle = `rgba(220,245,235,${st.a})`;
      ctx.fillRect(x, st.sy, st.r, st.r);
    }

    // Neon floor: a wash of the world's colour under the line, then the line itself as a wide glow
    // with a white core — the same halo-around-a-core recipe every neon element here uses.
    const wash = ctx.createLinearGradient(0, L.gy, 0, h);
    wash.addColorStop(0, rgba(obst, 0.22));
    wash.addColorStop(1, rgba(obst, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, L.gy, w, h - L.gy);
    for (const [lw, style] of [
      [5, rgba(obst, 0.3)],
      [2, rgba(obst, 0.8)],
      [1, 'rgba(255,255,255,0.85)'],
    ] as const) {
      ctx.strokeStyle = style;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(0, L.gy + 0.5);
      ctx.lineTo(w, L.gy + 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(obst, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = -((ts * L.v) % L.tickGap); gx < w; gx += L.tickGap) {
      ctx.moveTo(gx, L.gy + 2);
      ctx.lineTo(gx - 4, L.gy + 6);
    }
    ctx.stroke();

    for (const o of L.obs) {
      const x = (((o.px - ts * L.v) % L.cl) + L.cl) % L.cl;
      if (x > w + 60) continue;
      const ow = L.s * 0.68;
      const reps = o.dbl ? 2 : 1;
      // One pool of light per obstacle group, not per spike — a double reads as one hazard.
      const hr = L.s * 1.4;
      const gcx = x + (reps * ow * 1.15 - ow * 0.15) / 2;
      ctx.globalAlpha = 0.75;
      ctx.drawImage(halo(obst), gcx - hr, L.gy - hr, hr * 2, hr * 2);
      ctx.globalAlpha = 1;
      for (let k = 0; k < reps; k++) {
        const bx = x + k * ow * 1.15;
        const shape = (): void => {
          ctx.beginPath();
          if (o.block) {
            ctx.rect(bx, L.gy - L.s * 0.6, ow, L.s * 0.6);
          } else {
            ctx.moveTo(bx, L.gy);
            ctx.lineTo(bx + ow / 2, L.gy - L.s * 0.85);
            ctx.lineTo(bx + ow, L.gy);
            ctx.closePath();
          }
        };
        // Neon outline over a translucent body: glow pass, colour core, translucent fill.
        shape();
        ctx.fillStyle = rgba(obst, 0.2);
        ctx.fill();
        ctx.lineJoin = 'round';
        for (const [lw, style] of [
          [3.5, rgba(obst, 0.3)],
          [1.4, rgba(obst, 0.95)],
        ] as const) {
          ctx.strokeStyle = style;
          ctx.lineWidth = lw;
          shape();
          ctx.stroke();
        }
        if (o.block) {
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.fillRect(bx, L.gy - L.s * 0.6, ow, Math.max(1, L.s * 0.06));
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(bx + ow / 2, L.gy - L.s * 0.85, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Landing dust: keyed off each jump's landing moment, so it needs no particle state.
    for (const j of L.jumps) {
      for (const off of [0, SECS]) {
        const lt = ts + off - (j.tj + j.dur);
        if (lt < 0 || lt >= 0.38) continue;
        const p = lt / 0.38;
        for (let k = 0; k < 5; k++) {
          const a = Math.PI + (k / 4) * Math.PI;
          const rr = p * L.s * (0.7 + (k % 3) * 0.3);
          ctx.fillStyle = `rgba(230,245,240,${(1 - p) * 0.35})`;
          ctx.beginPath();
          // Dust keeps a near-constant pixel size: scaled down it dissolves into antialiasing.
          ctx.arc(
            L.x0 + Math.cos(a) * rr * 1.6,
            L.gy - 2 - Math.abs(Math.sin(a)) * rr * 0.5,
            1.6 * (1 - p * 0.5),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }

    const jh = L.s * 2.05;
    // Ghosts first (oldest deepest), the live cube last: each is the same pose a beat in the past.
    for (let g = 4; g >= 0; g--) {
      const p = jumpPhase(L, (((ts - g * 0.028) % SECS) + SECS) % SECS);
      const cy = L.gy - L.s / 2 - (p >= 0 ? jh * 4 * p * (1 - p) : 0);
      const live = g === 0;
      let squash = 1;
      if (live && p < 0) {
        for (const j of L.jumps) {
          for (const off of [0, SECS]) {
            const sl = ts + off - (j.tj + j.dur);
            if (sl >= 0 && sl < 0.12) squash = 0.8 + 0.2 * (sl / 0.12);
          }
        }
      }
      ctx.save();
      ctx.translate(L.x0 - g * 3, cy);
      if (p >= 0) ctx.rotate(Math.PI * p);
      ctx.scale(1, squash);
      ctx.fillStyle = rgba(base, live ? 0.95 : 0.14 * (1 - g / 5));
      ctx.beginPath();
      const r = L.s * 0.16;
      if (ctx.roundRect) ctx.roundRect(-L.s / 2, -L.s / 2, L.s, L.s, r);
      else ctx.rect(-L.s / 2, -L.s / 2, L.s, L.s);
      ctx.fill();
      if (live) {
        ctx.strokeStyle = rgba(edge, 0.9);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // The inner face outline — the one detail that says "runner cube", not "square".
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1;
        const inner = L.s * 0.52;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-inner / 2, -inner / 2, inner, inner, r * 0.6);
        else ctx.rect(-inner / 2, -inner / 2, inner, inner);
        ctx.stroke();
      }
      ctx.restore();
      if (live) {
        const hr = L.s * 2.6;
        ctx.drawImage(halo(base), L.x0 - hr, cy - hr, hr * 2, hr * 2);
      }
    }
  };
}

function render(
  layer: HTMLElement,
  _surface: Surface,
  _compact: boolean,
  color?: string,
  color2?: string,
): (() => void) | void {
  if (typeof document === 'undefined') return;
  return mountScene(layer, 'card-runner', scene(color || MINT, color2 || OBST), {
    loopMs: LOOP,
    stillMs: STILL,
    maxLive: 8,
  });
}

export const cardRunner: CardEffectModule = {
  id: 'card-runner',
  type: 'card_effect',
  costDust: 4000,
  since: '2026-08-28',
  className: 'card-fx-runner',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  colorUpgrade: 'card-runner-color',
  dualColor: true,
  labels: { name: 'shop.cardRunner', desc: 'shop.cardRunnerDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
