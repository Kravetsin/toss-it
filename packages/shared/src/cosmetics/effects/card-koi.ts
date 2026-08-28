import type { CardEffectModule, Surface } from '../types';
import { mountScene, sceneHash as hash, sceneLighten, sceneRgba as rgba } from '../canvas';

/**
 * A koi pond seen from above. Two carp glide on closed loops (integer-frequency curves, so the 14s
 * loop is seamless); soft caustic blobs of light wander the water; now and then a fish kisses the
 * surface and rings spread from the touch.
 *
 * The body is a chain of circles laid along the fish's OWN flown path, resampled to fixed
 * arc-length steps — time-spaced samples stretch the fish on the straights and, worse, quantise
 * the joints on the turns (the first pass twitched exactly there). Sampling finely and
 * interpolating to the exact step keeps it one animal at any speed. An undulation wave runs
 * head → tail, growing toward the tail, and the tail fin fans past the last segment.
 *
 * The rings follow the Tide's water recipe wholesale: two staggered fronts at CONSTANT speed
 * (easeOut is a blast, not water), a soft tinted halo around a hairline white core, amplitude
 * dying as (1-t)^0.7, and a glint at the touch itself.
 *
 * NEON koi: each fish swims in its own pool of glow and wears a bright rim on the head — the
 * pond's two lights. The DUAL colour upgrade sells the pair as one purchase: colour 1 is the
 * first fish, colour 2 the second, and each wears the OTHER's hue as its patches, so whatever
 * two colours the viewer picks, the fish stay a matched pair rather than two strangers.
 */

const LOOP = 14000;
const SECS = LOOP / 1000;
const TAU = Math.PI * 2;
// The undulation completes 13 whole cycles per loop — near the 6 rad/s that reads as swimming.
const UND = (TAU * 13) / SECS;
const PROFILE = [0.52, 1, 0.95, 0.8, 0.62, 0.46, 0.3, 0.16];

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const C1 = '#f2ede2';
const C2 = '#f2a65a';

interface Fish {
  fx: number;
  fy: number;
  phx: number;
  phy: number;
  dir: number;
  body: string;
  patch: string;
  rim: string;
  ringAt: number;
}

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

function scene(c1: string, c2: string) {
  const fish: Fish[] = [
    // Each fish wears the other's hue as its patches — the pair stays matched at any two colours.
    {
      fx: 1,
      fy: 2,
      phx: 0.9,
      phy: 1.3,
      dir: 1,
      body: c1,
      patch: c2,
      rim: sceneLighten(c1, 0.6),
      ringAt: 2.5,
    },
    {
      fx: 2,
      fy: 1,
      phx: 4.2,
      phy: 0.6,
      dir: -1,
      body: c2,
      patch: c1,
      rim: sceneLighten(c2, 0.6),
      ringAt: 9.5,
    },
  ];
  return (ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void => {
    paint(ctx, w, h, t, fish);
  };
}

function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  fishes: Fish[],
): void {
  const ts = t / 1000;
  const S = clamp(h * 0.14, 4.5, 13);
  for (let i = 0; i < 6; i++) {
    const n = 1 + Math.floor(hash(i, 101) * 2);
    const ph = hash(i, 102) * TAU;
    const ax = 20 + hash(i, 103) * 30;
    const x = hash(i, 104) * w + Math.sin((TAU * n * ts) / SECS + ph) * ax;
    const y = hash(i, 105) * h + Math.cos((TAU * n * ts) / SECS + ph * 2) * ax * 0.5;
    spill(ctx, x, y, 26, '#bfe8d8', 0.35);
  }
  for (const f of fishes) {
    const at = (tm: number): [number, number] => {
      const q = (TAU * tm) / SECS;
      return [
        w * (0.5 + 0.34 * Math.sin(f.fx * q * f.dir + f.phx)),
        h * (0.5 + 0.3 * Math.sin(f.fy * q * f.dir + f.phy)),
      ];
    };
    // Spine: walk BACK along the flown path at fixed arc steps. Sampled finely and interpolated
    // to the exact distance — coarse time steps quantised the joints and the fish twitched.
    const step = S * 0.85;
    const fine = 0.004;
    const spine: [number, number][] = [at(ts)];
    let back = 0;
    let prev = spine[0]!;
    for (let k = 1; k < 8; k++) {
      let need = step;
      let guard = 0;
      while (guard++ < 600 && back < 4) {
        const q = at(ts - back - fine);
        const d = Math.hypot(q[0] - prev[0], q[1] - prev[1]);
        if (d >= need) {
          const fr = need / d;
          prev = [lerp(prev[0], q[0], fr), lerp(prev[1], q[1], fr)];
          back += fine * fr;
          break;
        }
        need -= d;
        prev = q;
        back += fine;
      }
      spine.push(prev);
    }
    // Neon: the fish swims in its own pool of light, thrown from the head.
    const [hx0, hy0] = spine[0]!;
    spill(ctx, hx0, hy0, S * 4.2, f.body, 0.85);
    // Undulation: a wave running head → tail, growing toward the tail.
    for (let k = 7; k >= 0; k--) {
      const [x, y] = spine[k]!;
      const [hx, hy] = spine[Math.max(0, k - 1)]!;
      const dx = hx - x;
      const dy = hy - y;
      const dlen = Math.hypot(dx, dy) || 1;
      const nx = -dy / dlen;
      const ny = dx / dlen;
      const um = Math.sin(k * 1.05 - ts * UND + f.phx) * S * 0.13 * (k / 7);
      const r = PROFILE[k]! * S;
      ctx.fillStyle = rgba(f.body, k === 0 ? 0.95 : 0.88);
      ctx.beginPath();
      ctx.arc(x + nx * um, y + ny * um, r, 0, TAU);
      ctx.fill();
      if (k <= 1) {
        // The neon rim: a bright edge on the head segments, derived from the body hue.
        ctx.strokeStyle = rgba(f.rim, 0.8);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x + nx * um, y + ny * um, r, 0, TAU);
        ctx.stroke();
      }
      if (k === 2 || k === 4) {
        ctx.fillStyle = rgba(f.patch, 0.85);
        ctx.beginPath();
        ctx.arc(x + nx * um + r * 0.25, y + ny * um - r * 0.2, r * 0.62, 0, TAU);
        ctx.fill();
      }
      if (k === 7) {
        // Tail fin: a small waving fan past the last spine dot.
        const fw = Math.sin(ts * UND + f.phx) * 0.5;
        ctx.fillStyle = rgba(f.body, 0.55);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x - (dx / dlen) * S * 1.5 + nx * S * (0.7 + fw),
          y - (dy / dlen) * S * 1.5 + ny * S * (0.7 + fw),
        );
        ctx.lineTo(
          x - (dx / dlen) * S * 1.5 - nx * S * (0.7 - fw),
          y - (dy / dlen) * S * 1.5 - ny * S * (0.7 - fw),
        );
        ctx.closePath();
        ctx.fill();
      }
    }
    // Surface kiss: two staggered rings at constant speed, halo + hairline core, plus a glint.
    const rl = (((ts - f.ringAt) % SECS) + SECS) % SECS;
    if (rl > 0 && rl < 1.5) {
      const [rx, ry] = at(f.ringAt);
      if (rl < 0.18) {
        ctx.fillStyle = `rgba(255,255,255,${(1 - rl / 0.18) * 0.8})`;
        ctx.beginPath();
        ctx.arc(rx, ry, 1.4, 0, TAU);
        ctx.fill();
      }
      for (const [lag, kk] of [
        [0, 1],
        [0.24, 0.55],
      ] as const) {
        const r2 = rl - lag;
        if (r2 <= 0 || r2 >= 1.25) continue;
        const R = 5 + r2 * clamp(Math.min(w, h) * 0.36, 24, 62);
        const a = Math.pow(1 - r2 / 1.25, 0.7) * kk;
        ctx.strokeStyle = rgba('#bfe8d8', a * 0.35);
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(rx, ry, R, R * 0.62, 0, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.8})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.ellipse(rx, ry, R, R * 0.62, 0, 0, TAU);
        ctx.stroke();
      }
    }
  }
}

function render(
  layer: HTMLElement,
  _surface: Surface,
  _compact: boolean,
  color?: string,
  color2?: string,
): (() => void) | void {
  if (typeof document === 'undefined') return;
  return mountScene(layer, 'card-koi', scene(color || C1, color2 || C2), {
    loopMs: LOOP,
    stillMs: 2000,
    maxLive: 8,
  });
}

export const cardKoi: CardEffectModule = {
  id: 'card-koi',
  type: 'card_effect',
  costDust: 5000,
  since: '2026-08-28',
  className: 'card-fx-koi',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  colorUpgrade: 'card-koi-color',
  dualColor: true,
  labels: { name: 'shop.cardKoi', desc: 'shop.cardKoiDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
