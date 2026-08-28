import type { CardEffectModule, Surface } from '../types';
import { mountScene, sceneHash as hash, sceneLighten, sceneRgba as rgba } from '../canvas';

/**
 * A murmuration wheels behind the card. There is no flocking simulation and no randomness at
 * runtime: seventy birds each follow the invisible leader's PAST positions (per-bird delay) plus a
 * small wheeling offset, and the band stretches, bunches and folds exactly the way delays against
 * a curved path make it. The leader's path and every wheeling offset complete whole cycles per
 * loop, so the 12s wrap is seamless by construction.
 *
 * A bird is a STROKE along its own velocity, never a dot — the stroke length follows the local
 * speed, which is what makes the fast edge of a turn glitter. The atmosphere is the flock's own
 * light: the birds draw in an additive pass (dense parts of the band bloom instead of clotting),
 * each carries a faint long ghost in the glow, a wide pool of light rides with the body of the
 * swarm, and dust motes in the air kindle where it passes — the same reacting-dust recipe the
 * blade duel and the portal pair proved.
 *
 * The colour upgrade repaints the light — glow, ghosts, dust — and derives the bright bird stroke
 * from the chosen hue, so a recolour keeps its white-hot leading edge.
 */

const LOOP = 12000;
const SECS = LOOP / 1000;
const TAU = Math.PI * 2;
const MINT = '#8df0cc';
const N = 70;
const PH1 = 2.1;
const PH2 = 4.7;

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

function spill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  a: number,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, 0.22 * a));
  g.addColorStop(0.45, rgba(color, 0.09 * a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function scene(base: string) {
  const bright = sceneLighten(base, 0.62);
  return (ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void => {
    const ts = t / 1000;
    const yAmp = h < 70 ? 0.28 : 0.3;
    const leader = (tm: number): [number, number] => {
      const q = (tm / SECS) * TAU;
      return [
        w * (0.5 + 0.35 * Math.sin(q * 2 + PH1) * (0.7 + 0.3 * Math.sin(q + PH2))),
        h * (0.5 + yAmp * Math.sin(q * 3 + PH2) + 0.12 * Math.sin(q * 5 + PH1)),
      ];
    };
    const [lx, ly] = leader(ts - 0.4);
    spill(ctx, lx, ly, Math.min(w, h) * 1.05, base, 0.55);
    spill(ctx, lx, ly, Math.min(w, h) * 0.45, base, 0.7);
    for (let i = 0; i < 14; i++) {
      const mx = hash(i, 71) * w;
      const my = hash(i, 72) * h;
      const a = clamp(1 - Math.hypot(mx - lx, my - ly) / (Math.min(w, h) * 0.85), 0, 1) * 0.55;
      if (a > 0.02) {
        ctx.fillStyle = rgba(base, a);
        ctx.beginPath();
        ctx.arc(mx, my, 0.6 + hash(i, 73), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < N; i++) {
      const delay = i * 0.022 + hash(i, 61) * 0.05;
      const R = 4 + Math.pow(hash(i, 62), 1.6) * Math.min(w, h) * 0.16;
      const n = (1 + Math.floor(hash(i, 64) * 3)) * (hash(i, 65) < 0.5 ? 1 : -1);
      // The wheeling offset completes whole turns per loop, so the seam never shows.
      const wob = (TAU * n * ts) / SECS + hash(i, 63) * TAU;
      const ox = Math.cos(wob) * R;
      const oy = Math.sin(wob) * R * 0.6;
      const [x1, y1] = leader(ts - delay - 0.05);
      const [x2, y2] = leader(ts - delay);
      const x = x2 + ox;
      const y = y2 + oy;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const sp = Math.hypot(dx, dy) || 1;
      const L = clamp(sp * 0.7, 1.6, 4.2);
      const al = 0.35 + hash(i, 66) * 0.55;
      ctx.strokeStyle = rgba(base, al * 0.22);
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x - (dx / sp) * L * 2.6, y - (dy / sp) * L * 2.6);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.strokeStyle = rgba(bright, al);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x - (dx / sp) * L, y - (dy / sp) * L);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  };
}

function render(
  layer: HTMLElement,
  _surface: Surface,
  _compact: boolean,
  color?: string,
): (() => void) | void {
  if (typeof document === 'undefined') return;
  return mountScene(layer, 'card-flock', scene(color || MINT), {
    loopMs: LOOP,
    stillMs: 2000,
    maxLive: 8,
  });
}

export const cardFlock: CardEffectModule = {
  id: 'card-flock',
  type: 'card_effect',
  costDust: 4000,
  since: '2026-08-28',
  className: 'card-fx-flock',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  colorUpgrade: 'card-flock-color',
  labels: { name: 'shop.cardFlock', desc: 'shop.cardFlockDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
