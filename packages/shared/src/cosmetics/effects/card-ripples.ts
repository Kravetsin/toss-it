import type { CardEffectModule, Surface } from '../types';
import { mountScene, sceneHash as hash, sceneRgb, sceneRgba as rgba } from '../canvas';

/**
 * Ripples: the card is a dark water surface made of glint-points; glowing motes sail down from the
 * card's TOP EDGE (slowly — they are sparks, not weather) and every landing sends out rings. The
 * rings are never drawn: a derivative-of-gaussian displaces each glint toward/away from the front
 * and flares it as the front passes, so the surface itself carries the wave — the Tide entrance
 * taught that a drawn symbol next to a simulation always loses. Because displacements from all
 * drops SUM per point, crossing ripples interfere for free, and that is the best part of the look.
 *
 * Water physics, not blast physics (also a Tide lesson): rings travel at CONSTANT speed — easeOut
 * on a radius is the signature of an explosion — and amplitude decays as (1-t)^0.7. Each drop
 * throws two fronts, a main ring and a weaker follower, like a real plip.
 *
 * Deterministic: drops and glints all come from sceneHash, ~one drop a second with jitter, and drop
 * ZERO is pinned to t=1.0s so the still frame always shows live rings. Geometry is per-frame from
 * the box (no cache): 7 events + ~150 points is cheaper than the code rain's grid.
 *
 * The colour upgrade paints the LIGHT — the falling mote, its halo, the splash, and the flare each
 * glint takes as a front passes — while the resting water stays neutral, so a recolour reads as
 * "my sparks", not "someone dyed the pond".
 */

const LOOP = 8000;
const SECS = LOOP / 1000;
const TAU = Math.PI * 2;
const NDROPS = 7;
const LIFE = 1.9;
const FALL_T = 0.75;
const MINT = '#8df0cc';
const NEUTRAL = [220, 245, 235];

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const mod = (x: number, m: number): number => ((x % m) + m) % m;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const halos = new Map<string, HTMLCanvasElement>();
/** Soft glow sprite, cached per colour — one gradient build, then drawImage at any alpha/size. */
function halo(color: string): HTMLCanvasElement {
  const hit = halos.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, rgba(color, 0.24));
  grad.addColorStop(0.45, rgba(color, 0.1));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  halos.set(color, c);
  return c;
}

interface Drop {
  t0: number;
  ox: number;
  oy: number;
  seed: number;
}

function scene(base: string) {
  const tint = sceneRgb(base);
  return (ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void => {
    const ts = t / 1000;
    const gap = clamp(Math.min(w, h) / 5, 12, 26);
    const vw = clamp(Math.hypot(w, h) * 0.16, 50, 140);
    const sigma = clamp(Math.min(w, h) * 0.18, 9, 30);
    const amp = clamp(Math.min(w, h) * 0.05, 2.5, 7);

    const drops: Drop[] = [];
    for (let i = 0; i < NDROPS; i++) {
      drops.push({
        // Drop 0 pinned: the reduced-motion still (1.6s) then always catches rings mid-spread.
        t0: i === 0 ? 1 : mod((i * SECS) / NDROPS + (hash(i, 21) - 0.5) * 0.55, SECS),
        ox: w * (0.08 + hash(i, 22) * 0.84),
        oy: h * (0.15 + hash(i, 23) * 0.7),
        seed: Math.floor(hash(i, 24) * 1000),
      });
    }

    let idx = 0;
    for (let gx = gap / 2; gx < w; gx += gap) {
      for (let gy = gap / 2; gy < h; gy += gap) {
        const px = gx + (hash(idx, 31) - 0.5) * gap * 0.5;
        const py = gy + (hash(idx, 32) - 0.5) * gap * 0.5;
        const pr = 0.6 + hash(idx, 33) * 0.9;
        idx++;
        let dxs = 0;
        let dys = 0;
        let boost = 0;
        for (const ev of drops) {
          const lt = mod(ts - ev.t0, SECS);
          if (lt <= 0 || lt > LIFE) continue;
          const decay = Math.pow(1 - lt / LIFE, 0.7);
          const dx = px - ev.ox;
          const dy = py - ev.oy;
          const d = Math.hypot(dx, dy) || 1;
          for (const [lag, k] of [
            [0, 1],
            [0.28, 0.45],
          ] as const) {
            const R = (lt - lag) * vw;
            if (R <= 0) continue;
            const q = (d - R) / sigma;
            const g = Math.exp(-q * q);
            const disp = q * g * amp * decay * k;
            dxs += (dx / d) * disp;
            dys += (dy / d) * disp;
            boost += g * decay * k;
          }
        }
        boost = Math.min(1, boost);
        // A flaring glint leans toward the chosen tint; resting water stays neutral.
        const m = boost * 0.85;
        const r = Math.round(lerp(NEUTRAL[0]!, tint[0], m));
        const gc = Math.round(lerp(NEUTRAL[1]!, tint[1], m));
        const b = Math.round(lerp(NEUTRAL[2]!, tint[2], m));
        ctx.fillStyle = `rgba(${r},${gc},${b},${0.12 + boost * 0.6})`;
        ctx.fillRect(px + dxs, py + dys, pr + boost, pr + boost);
      }
    }

    const spr = halo(base);
    for (const ev of drops) {
      // The droplet: a glowing mote sailing unhurried from the card's top edge.
      const fl = mod(ts - (ev.t0 - FALL_T), SECS);
      if (fl > 0 && fl < FALL_T) {
        const p = fl / FALL_T;
        const yAt = (pp: number): number => lerp(-3, ev.oy, Math.pow(clamp(pp, 0, 1), 1.6));
        const y = yAt(p);
        for (let k = 3; k >= 1; k--) {
          ctx.fillStyle = rgba(base, 0.3 * (1 - k / 4));
          ctx.beginPath();
          ctx.arc(ev.ox, yAt(p - k * 0.05), 1.1, 0, TAU);
          ctx.fill();
        }
        const hr = clamp(Math.min(w, h) * 0.16, 9, 26);
        ctx.globalAlpha = 0.5 + p * 0.5;
        ctx.drawImage(spr, ev.ox - hr, y - hr, hr * 2, hr * 2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(ev.ox, y, 1.6, 0, TAU);
        ctx.fill();
      }
      // Impact: a brief glint and three micro-droplets tossed up, drawn only above the surface.
      const im = mod(ts - ev.t0, SECS);
      if (im > 0 && im < 0.45) {
        const p = im / 0.45;
        const hr = clamp(Math.min(w, h) * 0.2, 10, 34);
        ctx.globalAlpha = (1 - p) * 0.9;
        ctx.drawImage(spr, ev.ox - hr, ev.oy - hr, hr * 2, hr * 2);
        ctx.globalAlpha = 1;
        if (im < 0.3) {
          ctx.fillStyle = `rgba(255,255,255,${(1 - im / 0.3) * 0.9})`;
          ctx.beginPath();
          ctx.arc(ev.ox, ev.oy, 1.4, 0, TAU);
          ctx.fill();
        }
        for (let k = 0; k < 3; k++) {
          const a = Math.PI * (1.15 + hash(ev.seed + k, 3) * 0.7);
          const sp = 16 + hash(ev.seed + k, 4) * 22;
          const dxk = Math.cos(a) * sp * p;
          const dyk = Math.sin(a) * sp * p + 60 * p * p;
          if (dyk < 2) {
            ctx.fillStyle = rgba(base, (1 - p) * 0.8);
            ctx.beginPath();
            ctx.arc(ev.ox + dxk, ev.oy + dyk, 1, 0, TAU);
            ctx.fill();
          }
        }
      }
    }
  };
}

function render(
  layer: HTMLElement,
  _surface: Surface,
  _compact: boolean,
  color?: string,
): (() => void) | void {
  if (typeof document === 'undefined') return;
  return mountScene(layer, 'card-ripples', scene(color || MINT), {
    loopMs: LOOP,
    stillMs: 1600,
    maxLive: 8,
  });
}

export const cardRipples: CardEffectModule = {
  id: 'card-ripples',
  type: 'card_effect',
  costDust: 4000,
  since: '2026-08-28',
  className: 'card-fx-ripples',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  colorUpgrade: 'card-ripples-color',
  labels: { name: 'shop.cardRipples', desc: 'shop.cardRipplesDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
