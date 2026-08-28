import type { EntranceModule } from '../types';

/**
 * A gust of sand sweeps left to right and the message shows up ON ITS FRONT — the wind is not
 * burying the block, it is digging it out. The block itself only loses its right-side clip as the
 * front passes; every ragged, organic thing about the edge is carried by the grains, whose density
 * is a gaussian of the distance to the front — the portal's lesson that a straight clip edge is
 * hidden by particle density, not by more geometry.
 *
 * Two populations again (the tide's spray taught the split): the STREAM — grains riding the gust in
 * the block's band, alive only near the front — and a few SETTLERS that land on the block's top
 * edge as the front passes their column, sit for a beat, and get blown off after the gust. The
 * settlers are what sells "the wind put it here": something has to be left behind and then cleaned
 * up, or the sand was just a wipe transition.
 *
 * Canvas IN FRONT of the block (grains must cross the revealed part), no transform on the block —
 * only the clip moves, so there is no position bookkeeping at all. Colour: the sand's own warm tone
 * by default; the entrance colour upgrade repaints the grains like any other entrance.
 */

const DUR = 1600; // ms — the sweep plus the tail where the stream thins out
const T0 = 80; // ms before the front starts moving
const SWEEP = 1000; // ms the front takes to cross the block
const DEFAULT_COLOR = '#d9c9a3';

interface Grain {
  dOff: number; // lateral offset from the front, px
  yv: number; // 0..1 across the block's band (±12px past it)
  r: number;
  ph: number;
  warm: number; // per-grain brightness variation, so the stream isn't a flat colour
}
interface Settler {
  u: number; // 0..1 along the block's width
  stay: number; // ms it sits on the edge before the wind takes it
  r: number;
}
interface Gust {
  el: HTMLElement;
  /** Surface the run may not draw outside of, or null on the body-level layer. See entrance-strike. */
  clipTo: HTMLElement | null;
  rgb: [number, number, number];
  grains: Grain[] | null;
  settlers: Settler[] | null;
  start: number | null;
  safety: ReturnType<typeof setTimeout>;
}

function setClip(el: HTMLElement, v: string): void {
  el.style.clipPath = v;
  (el.style as unknown as Record<string, string>).webkitClipPath = v;
}
function reset(el: HTMLElement): void {
  el.style.clipPath = '';
  (el.style as unknown as Record<string, string>).webkitClipPath = '';
}
function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let dpr = 1;
let resizeBound = false;
const active: Gust[] = [];

function resize(): void {
  if (!canvas || !ctx) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function ensureCanvas(mount: HTMLElement): void {
  if (canvas && canvas.isConnected && canvas.parentNode === mount) return;
  if (canvas) canvas.remove();
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const st = canvas.style;
  st.position = 'fixed';
  st.left = '0';
  st.top = '0';
  st.width = '100%';
  st.height = '100%';
  st.pointerEvents = 'none';
  // In front: the stream has to blow across the already-revealed part of the message.
  st.zIndex = mount === document.body ? '2147483000' : '2';
  mount.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  if (!resizeBound) {
    window.addEventListener('resize', resize);
    resizeBound = true;
  }
}

function build(bw: number): [Grain[], Settler[]] {
  const n = Math.round(clamp(bw * 0.35, 60, 120));
  const grains: Grain[] = [];
  for (let i = 0; i < n; i++) {
    grains.push({
      dOff: (Math.random() - 0.5) * 100,
      yv: Math.random(),
      r: 0.8 + Math.random() * 1.4,
      ph: Math.random() * Math.PI * 2,
      warm: Math.random(),
    });
  }
  const settlers: Settler[] = [];
  for (let i = 0; i < 12; i++) {
    settlers.push({ u: Math.random(), stay: 220 + Math.random() * 320, r: 1 + Math.random() });
  }
  return [grains, settlers];
}

function drop(t: Gust, index: number): void {
  clearTimeout(t.safety);
  reset(t.el);
  active.splice(index, 1);
}
function remove(t: Gust): void {
  const i = active.indexOf(t);
  if (i >= 0) drop(t, i);
}

function frame(now: number): void {
  raf = 0;
  if (!ctx || !canvas) return;
  // Clear with the transform reset — see entrance-tide for why (dpr ≠ 1 leaves strips otherwise).
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cRect = canvas.getBoundingClientRect();
  for (let i = active.length - 1; i >= 0; i--) {
    const t = active[i]!;
    if (!t.el.isConnected) {
      drop(t, i);
      continue;
    }
    const rect = t.el.getBoundingClientRect();
    if (rect.width < 1) continue;
    if (t.start === null) {
      t.start = now;
      [t.grains, t.settlers] = build(rect.width);
    }
    const ms = now - t.start;
    if (ms >= DUR) {
      drop(t, i);
      continue;
    }
    const bx = rect.left - cRect.left;
    const by = rect.top - cRect.top;
    const bw = rect.width;
    const bh = rect.height;
    const sec = ms / 1000;
    const p = clamp((ms - T0) / SWEEP, 0, 1);
    // Linear, like wind, not like a spring: the front crosses at constant speed, from just left of
    // the block to well past its right edge so the density peak fully clears the corner.
    const front = bx - 30 + (bw + 70) * p;
    const revealed = clamp(front - 6 - bx, 0, bw);
    setClip(t.el, revealed >= bw ? 'none' : `inset(0 ${Math.ceil(bw - revealed)}px 0 0)`);

    ctx.save();
    if (t.clipTo) {
      const padX = Math.max(24, bh);
      const padY = Math.max(20, bh * 0.6);
      ctx.beginPath();
      ctx.rect(bx - padX, by - padY, bw + padX * 2, bh + padY * 2);
      ctx.clip();
    }
    const [r, g, b] = t.rgb;
    // The stream: alive only near the front (gaussian), blown out to the right after the sweep.
    const gone = clamp((ms - T0 - SWEEP) / 400, 0, 1);
    for (const gr of t.grains!) {
      const x = front + gr.dOff + Math.sin(sec * 7 + gr.ph) * 3 + gone * 90;
      const q = (x - front) / 45;
      const a = Math.exp(-q * q) * 0.8 * (1 - gone);
      if (a < 0.03) continue;
      const w = gr.warm * 22;
      ctx.fillStyle = `rgba(${Math.min(255, r + w)},${Math.min(255, g + w * 0.5)},${b},${a})`;
      ctx.fillRect(x, by - 12 + gr.yv * (bh + 24) + Math.sin(sec * 5 + gr.ph * 2) * 2, gr.r, gr.r);
    }
    // The settlers: land on the top edge as the front passes their column, sit, then blow off.
    for (const st of t.settlers!) {
      const x0 = bx + st.u * bw;
      const landed = T0 + ((x0 - (bx - 30)) / (bw + 70)) * SWEEP;
      const lt = ms - landed;
      if (lt < 0) continue;
      if (lt < st.stay) {
        ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
        ctx.fillRect(x0, by - 2, st.r, st.r);
      } else if (lt < st.stay + 350) {
        const q = (lt - st.stay) / 350;
        ctx.fillStyle = `rgba(${r},${g},${b},${0.85 * (1 - q)})`;
        ctx.fillRect(x0 + q * 60, by - 2 - q * 14, st.r, st.r);
      }
    }
    ctx.restore();
  }
  if (active.length) raf = requestAnimationFrame(frame);
}

function play(
  el: HTMLElement,
  mount: HTMLElement = document.body,
  color?: string,
): (() => void) | void {
  if (typeof document === 'undefined') return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  ensureCanvas(mount);
  // Hidden until the front reaches it; the first laid-out frame replaces this with a px inset.
  setClip(el, 'inset(0 100% 0 0)');
  const t: Gust = {
    el,
    clipTo: mount === document.body ? null : mount,
    rgb: hexToRgb(color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR),
    grains: null,
    settlers: null,
    start: null,
    safety: setTimeout(() => remove(t), DUR + 1500),
  };
  active.push(t);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => remove(t);
}

export const entranceGust: EntranceModule = {
  id: 'entrance-gust',
  type: 'entrance',
  // The tide's shelf: a canvas entrance with one clean idea, calm rather than a showpiece.
  costDust: 3000,
  since: '2026-08-28',
  fx: 'gust',
  labels: { name: 'shop.entranceGust', desc: 'shop.entranceGustDesc' },
  play,
  // No `css`: the whole effect is JS (clip on the block, canvas for the sand). data-fx only needs
  // to EXIST so the surface's own default entrance (:not([data-fx])) stands down.
};
