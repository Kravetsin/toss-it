import type { CardEffectModule } from '../types';
import { mountScene, sceneHash as hash, sceneRgba as rgba } from '../canvas';

/**
 * Hoarfrost: fern crystals grow from the corners and edges the way frost draws on winter glass —
 * segment by segment, barbs off each node — stand and glitter for a while, then melt from the
 * TIPS first (the real order) and leave the card clear to breathe before the next cycle.
 *
 * Under the ferns sits the frozen pane itself: misted gradient bands from every edge, cold
 * corners, and crystal grit twinkling inside the bands, all keyed to the same grow/melt cycle —
 * the ferns are the drawing, the pane is the glass they grow on.
 *
 * Growth is drawn as strokes appearing (the newest segment extends partially), NOT as animated
 * masks — the handprints effect died on mask repaints, and nothing here touches that machinery.
 * The fern geometry is deterministic per box size and cached: ~360 strokes per layout is cheap to
 * draw but not to rebuild every frame.
 */

const LOOP = 10000;
const ICE = '#cfe9ff';

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

interface Stroke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  birth: number; // s after the fern's own start
  depth: number; // 0 root .. 1 tip — melting order
  wMain?: boolean;
}
interface Fern {
  strokes: Stroke[];
  start: number;
}
interface Layout {
  ferns: Fern[];
  all: Stroke[];
}
const layouts = new Map<string, Layout>();

function layoutFor(w: number, h: number): Layout {
  const key = `${w}x${h}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const ferns: Fern[] = [];
  const seeds: [number, number, number][] = [
    [2, h * 0.85, -0.5],
    [w - 2, h * 0.2, Math.PI + 0.4],
    [w * 0.28, h - 2, -Math.PI / 2 + 0.3],
    [w * 0.75, 2, Math.PI / 2 - 0.35],
  ];
  const segLen = clamp(Math.min(w, h) * 0.05, 4, 9);
  seeds.forEach(([sx, sy, ang0], fi) => {
    const strokes: Stroke[] = [];
    let x = sx;
    let y = sy;
    let ang = ang0;
    const N2 = 13;
    for (let k = 0; k < N2; k++) {
      const nx = x + Math.cos(ang) * segLen;
      const ny = y + Math.sin(ang) * segLen;
      strokes.push({ x1: x, y1: y, x2: nx, y2: ny, birth: k * 0.16, depth: k / N2, wMain: true });
      // Two branchlets per node, half scale, angled off like a feather's barbs.
      for (const sgn of [1, -1]) {
        let bx = nx;
        let by = ny;
        let ba = ang + sgn * 0.85;
        const bn = 2 + Math.floor(hash(fi * 100 + k, 5) * 3);
        for (let j = 0; j < bn; j++) {
          const ex = bx + Math.cos(ba) * segLen * 0.55;
          const ey = by + Math.sin(ba) * segLen * 0.55;
          strokes.push({
            x1: bx,
            y1: by,
            x2: ex,
            y2: ey,
            birth: k * 0.16 + 0.1 + j * 0.09,
            depth: (k + 1 + j) / (N2 + 4),
          });
          bx = ex;
          by = ey;
          ba += sgn * 0.18;
        }
      }
      x = nx;
      y = ny;
      ang += (hash(fi * 31 + k, 7) - 0.5) * 0.5;
    }
    ferns.push({ strokes, start: fi * 0.35 });
  });
  const built: Layout = { ferns, all: ferns.flatMap((f) => f.strokes) };
  if (layouts.size > 12) layouts.clear();
  layouts.set(key, built);
  return built;
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const tt = t / 1000;
  const L = layoutFor(w, h);
  // The frozen pane: misted edge bands, cold corners and crystal grit, breathing with the ferns.
  const grow = clamp((tt - 0.2) / 2.8, 0, 1);
  const aliveG = clamp((8.4 - tt) / 1.4, 0, 1);
  const pane = Math.min(grow, aliveG);
  if (pane > 0.02) {
    const depth = clamp(Math.min(w, h) * 0.24, 12, 52) * (0.55 + 0.45 * pane);
    const band = (x0: number, y0: number, x1: number, y1: number): void => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, `rgba(205,232,255,${0.13 * pane})`);
      g.addColorStop(0.6, `rgba(205,232,255,${0.05 * pane})`);
      g.addColorStop(1, 'rgba(205,232,255,0)');
      ctx.fillStyle = g;
    };
    band(0, 0, depth, 0);
    ctx.fillRect(0, 0, depth, h);
    band(w, 0, w - depth, 0);
    ctx.fillRect(w - depth, 0, depth, h);
    band(0, 0, 0, depth);
    ctx.fillRect(0, 0, w, depth);
    band(0, h, 0, h - depth);
    ctx.fillRect(0, h - depth, w, depth);
    for (const [cx, cy] of [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ] as const) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, depth * 2);
      g.addColorStop(0, `rgba(215,238,255,${0.16 * pane})`);
      g.addColorStop(1, 'rgba(215,238,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - depth * 2, cy - depth * 2, depth * 4, depth * 4);
    }
    const nGrit = Math.round(clamp((w + h) / 14, 40, 110));
    for (let i = 0; i < nGrit; i++) {
      const side = i % 4;
      const along = hash(i, 41);
      const into = Math.pow(hash(i, 42), 1.7) * depth;
      const gx = side === 0 ? into : side === 1 ? w - into : along * w;
      const gy = side < 2 ? along * h : side === 2 ? into : h - into;
      const tw = 0.4 + 0.6 * hash(Math.floor(tt * 3) + i, 43);
      ctx.fillStyle = `rgba(230,244,255,${0.3 * pane * tw})`;
      ctx.fillRect(gx, gy, 1 + hash(i, 44), 1 + hash(i, 44));
    }
  }
  ctx.lineCap = 'round';
  let visible = 0;
  for (const fern of L.ferns) {
    for (const st of fern.strokes) {
      const born = clamp((tt - fern.start - st.birth) / 0.3, 0, 1);
      // Tips melt first: the deeper a stroke sits, the longer it survives.
      const meltAt = 6.3 + (1 - st.depth) * 2;
      const alive = clamp((meltAt - tt) / 0.5, 0, 1);
      const a = born * alive;
      if (a <= 0.02) continue;
      visible++;
      ctx.strokeStyle = rgba(ICE, 0.55 * a);
      ctx.lineWidth = st.wMain ? 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(st.x1, st.y1);
      // The last-born segment draws in partially — growth, not appearance.
      ctx.lineTo(lerp(st.x1, st.x2, born), lerp(st.y1, st.y2, born));
      ctx.stroke();
    }
  }
  // Glints while the frost stands: tiny 4-ray stars twinkling on random grown strokes.
  if (tt > 2.4 && tt < 6.4 && visible) {
    for (let g = 0; g < 3; g++) {
      const gi = Math.floor(hash(Math.floor(tt * 4) + g * 37, 11) * L.all.length);
      const st = L.all[gi]!;
      const pu = Math.sin(((((tt * 4 + g) % 1) + 1) % 1) * Math.PI);
      const gr = 2.5 + pu * 2;
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * pu})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(st.x2 - gr, st.y2);
      ctx.lineTo(st.x2 + gr, st.y2);
      ctx.moveTo(st.x2, st.y2 - gr);
      ctx.lineTo(st.x2, st.y2 + gr);
      ctx.stroke();
    }
  }
  // A cold breath at the edges, following how much frost is standing.
  const cov = clamp(visible / 60, 0, 1) * 0.5;
  if (cov > 0.02) {
    const vg = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.min(w, h) * 0.3,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.75,
    );
    vg.addColorStop(0, 'rgba(190,225,255,0)');
    vg.addColorStop(1, `rgba(190,225,255,${0.1 * cov})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }
}

function render(layer: HTMLElement): (() => void) | void {
  if (typeof document === 'undefined') return;
  return mountScene(layer, 'card-frost', paint, { loopMs: LOOP, stillMs: 4000, maxLive: 6 });
}

export const cardFrost: CardEffectModule = {
  id: 'card-frost',
  type: 'card_effect',
  costDust: 4000,
  since: '2026-08-28',
  className: 'card-fx-frost',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  labels: { name: 'shop.cardFrost', desc: 'shop.cardFrostDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
