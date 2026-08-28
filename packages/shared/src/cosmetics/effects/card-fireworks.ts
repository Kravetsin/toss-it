import type { CardEffectModule } from '../types';
import { mountScene, sceneHash as hash, sceneRgba as rgba } from '../canvas';

/**
 * Fireworks: five launches per loop, three shell types with their real signatures — a peony's
 * sparks die off unevenly on the way out (per-spark lifespans; an even die-off reads as a shutter
 * closing), a willow's droop under gravity with long dense tails, a crackle breaks into white
 * strobing pops at the end. Every burst floods the card with light for a beat.
 *
 * The rocket climbs STRAIGHT with a constant per-launch lean — an early version wobbled it with a
 * sine and it read as a shaking spiral. Behind it, smoke breadcrumbs; the burst is centred where
 * the leaning rocket actually arrived, not over the launch point.
 *
 * Launch #0 is pinned to t=0.5s, so the reduced-motion still always lands early in a burst with
 * the light-spill at its brightest. Deliberately multi-coloured (mint / gold / violet in turn) —
 * that is the identity of a fireworks show, which is why this one carries no colour upgrade.
 */

const LOOP = 8000;
const SECS = LOOP / 1000;
const TAU = Math.PI * 2;
const TYPES = ['peony', 'willow', 'crackle', 'peony', 'willow'] as const;
const COLS = ['#8df0cc', '#ffd166', '#b18cff', '#ffd166', '#8df0cc'];

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

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

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const ts = t / 1000;
  const R = clamp(Math.min(w, h) * 0.55, 20, 95);
  for (let si = 0; si < 5; si++) {
    // Launch 0 pinned for the still frame; the rest jittered around a steady cadence.
    const t0 = si === 0 ? 0.5 : (0.5 + si * 1.5 + (hash(si, 51) - 0.5) * 0.4) % SECS;
    const x0 = w * (0.15 + hash(si, 52) * 0.7);
    const apex = h * (0.18 + hash(si, 53) * 0.3);
    const type = TYPES[si]!;
    const col = COLS[si]!;
    const seed = Math.floor(hash(si, 54) * 999);
    const lt = (((ts - t0) % SECS) + SECS) % SECS;
    const tilt = (hash(seed, 21) - 0.5) * 0.14;
    const xAt = (y: number): number => x0 + (y - (h + 6)) * tilt;
    if (lt > 0 && lt < 0.5) {
      const p = lt / 0.5;
      const y = lerp(h + 6, apex, 1 - (1 - p) * (1 - p));
      for (let k = 1; k <= 5; k++) {
        const pk = Math.max(0, p - k * 0.07);
        const yk = lerp(h + 6, apex, 1 - (1 - pk) * (1 - pk));
        ctx.fillStyle = `rgba(205,220,210,${0.16 * (1 - k / 6)})`;
        ctx.fillRect(xAt(yk) - 0.5, yk, 1, 1.6);
      }
      ctx.strokeStyle = `rgba(255,244,220,${0.55 + p * 0.35})`;
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(xAt(y + 8), y + 8);
      ctx.lineTo(xAt(y), y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(xAt(y), y, 1.2, 0, TAU);
      ctx.fill();
    }
    const bt = lt - 0.5;
    if (bt > 0 && bt < 1.8) {
      const p = bt / 1.8;
      const cx0 = xAt(apex);
      if (bt < 0.3) spill(ctx, cx0, apex, R * 2.2, col, (1 - bt / 0.3) * 1.6);
      const willow = type === 'willow';
      const grav = willow ? 66 : 28;
      const v0 = R * (willow ? 0.72 : 1.05);
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * TAU + hash(seed + i, 2) * 0.22;
        const v = v0 * (0.72 + hash(seed + i, 3) * 0.4);
        const life = 0.8 + hash(seed + i, 9) * 0.35;
        const pp = p / life;
        if (pp >= 1) continue;
        const pos = (q: number): [number, number] => [
          cx0 + Math.cos(a) * v * q * (1 - 0.38 * q),
          apex + Math.sin(a) * v * q * (1 - 0.38 * q) * 0.85 + grav * q * q * 1.8,
        ];
        const segs = willow ? 5 : 3;
        const gap = willow ? 0.055 : 0.035;
        let al = (1 - pp) * 0.9;
        const strobe = type === 'crackle' && pp > 0.5;
        if (strobe) al *= 0.25;
        if (pp > 0.75 && !strobe) al *= 0.55 + 0.45 * hash(Math.floor(ts * 22) + i, seed);
        ctx.lineCap = 'round';
        for (let sgi = segs; sgi >= 1; sgi--) {
          const q2 = Math.max(0, p - (sgi - 1) * gap);
          const q1 = Math.max(0, p - sgi * gap);
          if (q2 <= 0) continue;
          const [x1, y1] = pos(q1);
          const [x2, y2] = pos(q2);
          ctx.strokeStyle = rgba(col, al * (1 - (sgi - 1) / segs));
          ctx.lineWidth = sgi === 1 ? 1.5 : 1;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        const [hx, hy] = pos(p);
        if (pp < 0.28) {
          ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - pp / 0.28)})`;
          ctx.beginPath();
          ctx.arc(hx, hy, 1.1, 0, TAU);
          ctx.fill();
        }
        if (strobe && hash(Math.floor(ts * 30) + i, seed) > 0.45) {
          const j = hash(Math.floor(ts * 30) + i * 7, 13);
          ctx.fillStyle = 'rgba(255,255,255,0.95)';
          ctx.beginPath();
          ctx.arc(hx + (j - 0.5) * 6, hy + (hash(i, 15) - 0.5) * 6, 1.3, 0, TAU);
          ctx.fill();
        }
      }
    }
  }
}

function render(layer: HTMLElement): (() => void) | void {
  if (typeof document === 'undefined') return;
  return mountScene(layer, 'card-fireworks', paint, { loopMs: LOOP, stillMs: 1300, maxLive: 8 });
}

export const cardFireworks: CardEffectModule = {
  id: 'card-fireworks',
  type: 'card_effect',
  costDust: 4500,
  since: '2026-08-28',
  className: 'card-fx-fireworks',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  labels: { name: 'shop.cardFireworks', desc: 'shop.cardFireworksDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
