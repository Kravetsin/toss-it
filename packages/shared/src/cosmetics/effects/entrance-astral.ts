import type { EntranceModule } from '../types';

/**
 * The message arrives WRAPPED IN A WEB OF LIGHT. Little will-o'-wisp orbs (a white-hot core in a soft
 * mint glow, the card-wisp look) stream in from every side and settle onto anchor points ringing the
 * block; threads of light weave between them into a web that envelops the message; the message resolves
 * inside it; then the web fades and the orbs go out, leaving the message behind.
 *
 * WHY IT SCALES WHERE A PORTAL CANNOT. The anchors ride the block's REAL bounding rect, sampled every
 * frame (inflated a few px so the web sits just OUTSIDE the border — see below), and their count is set
 * by that rect's perimeter. A one-word "гг" gets a tight little web and a wrapped multi-line post gets a
 * long one — the frame grows WITH the message instead of a fixed shape stretched to fit. Nothing here
 * has an aspect ratio to distort.
 *
 * WHY THE CANVAS IS IN FRONT. The web is drawn OVER the block (a high z-index on the overlays; just
 * above the lifted block in a mounted surface), so it genuinely WRAPS the message rather than hiding
 * behind it. The message is held hidden and resolves UNDER the web as it weaves — the arrival takes a
 * beat, the same way the portal's block only drives out partway through its run. It is a light frame —
 * an edge ring plus a few threads crossing the message, not a solid fill — so what lies over the text
 * is thin, faint and gone in ~1.6s; legibility is barely touched.
 *
 * HOW A WISP ORB IS DRAWN. Two sprites stacked, exactly like card-wisp's dot + box-shadow — a soft
 * mint HALO and, on top, a small CRISP core disc with a defined edge. Drawing it as one gradient made a
 * blurry smudge; the crisp core is what makes it read as an orb.
 *
 * The threads sit under the orbs: an outer ring hugging the edge plus longer inner chords that cross
 * the message, and the whole web SWAYS in a wind that builds toward the end, so it looks blown loose as
 * it dissolves. The card arrives FLOODED with the web's mint light from within, which then drains
 * clear — a soft inner glow, not an outer flash that would strobe the viewer every message — and
 * everything is dropped at opacity 0 so the run ends clean. Reduced motion is honoured in applyEntrance
 * (no data-fx, no play) and again here for direct callers like the shop.
 */

const DUR = 1600; // ms — stream in → weave → wrap → let go
// Brand mint default; overridable per viewer by a future colour upgrade, like the portal's. NOT
// --color-accent — a cosmetic must look identical on every surface.
const DEFAULT_COLOR = '#8df0cc';
const MARGIN = 2; // px the anchor ring sits outside the block's border — hugging it now the web is on top
const TAU = Math.PI * 2;

interface Node {
  ang: number; // direction of its scattered origin from the block centre
  rf: number; // origin distance, in units of the block's larger side
  delay: number; // stagger into the run so they don't all launch together
  sz: number; // 0..1 size factor
  tw: number; // twinkle phase once settled
  accent: boolean; // paler mint instead of the base colour
}
interface Assembly {
  el: HTMLElement;
  color: string;
  /** A paler shade of `color`, sprinkled through the orbs for a two-tone glow. Derived, not fixed, so
   *  the two-tone still works whatever colour the viewer picks. */
  accent: string;
  /** `color` as "r,g,b", for the rgba() stops of the inner glow. */
  rgb: string;
  nodes: Node[] | null; // built on the first laid-out frame, when the perimeter is known
  start: number | null;
  safety: ReturnType<typeof setTimeout>;
}

function reset(el: HTMLElement): void {
  el.style.opacity = '';
  el.style.filter = '';
  el.style.transform = '';
}
function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
// A point at parameter i/n around a rect's perimeter, walking the four edges in order.
function perim(i: number, n: number, x: number, y: number, w: number, h: number): [number, number] {
  const tot = 2 * (w + h);
  let d = ((i % n) / n) * tot;
  if (d < w) return [x + d, y];
  d -= w;
  if (d < h) return [x + w, y + d];
  d -= h;
  if (d < w) return [x + w - d, y + h];
  d -= w;
  return [x, y + h - d];
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let dpr = 1;
let resizeBound = false;
const active: Assembly[] = [];
const spriteCache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// The halo: a soft radial glow of `color`, no hard edge — this is the card-wisp box-shadow.
function glowSpriteFor(color: string): HTMLCanvasElement {
  const key = 'g|' + color;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const [r, g, b] = hexToRgb(color);
  const s = document.createElement('canvas');
  s.width = s.height = 32;
  const c = s.getContext('2d')!;
  const grad = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.8)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},0.36)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, 32, 32);
  spriteCache.set(key, s);
  return s;
}
// The core: a bright disc — white centre, the colour to ~86%, then a SHARP drop to nothing, so the
// edge stays crisp instead of dissolving. This is card-wisp's `radial-gradient(... 58%, transparent)`.
function coreSpriteFor(color: string): HTMLCanvasElement {
  const key = 'c|' + color;
  const cached = spriteCache.get(key);
  if (cached) return cached;
  const [r, g, b] = hexToRgb(color);
  const s = document.createElement('canvas');
  s.width = s.height = 32;
  const c = s.getContext('2d')!;
  const grad = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.42, 'rgba(255,255,255,0.96)');
  grad.addColorStop(0.56, `rgba(${r},${g},${b},0.96)`);
  grad.addColorStop(0.86, `rgba(${r},${g},${b},0.92)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`); // the last 14% is the only soft part — a clean edge
  c.fillStyle = grad;
  c.fillRect(0, 0, 32, 32);
  spriteCache.set(key, s);
  return s;
}
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
  // IN FRONT of the message, so the web wraps OVER it (see the header). On the transparent overlays
  // that's a high z-index above the bubbles/alert; inside an opaque mounted surface (the shop drawer's
  // isolated row) it sits just above the lifted block (z 2 vs the block's z-1). pointer-events:none, so
  // being on top never blocks anything.
  st.zIndex = mount === document.body ? '2147483000' : '2';
  mount.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  if (!resizeBound) {
    window.addEventListener('resize', resize);
    resizeBound = true;
  }
}

function buildNodes(peri: number): Node[] {
  // One anchor per ~52px of perimeter — enough for a woven web, sparse enough that the nodes read.
  const n = clamp(Math.round(peri / 52), 8, 26);
  const out: Node[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      ang: Math.random() * TAU,
      rf: 1.05 + Math.random() * 0.95,
      delay: Math.random() * 0.2,
      sz: Math.random(),
      tw: Math.random() * TAU,
      accent: Math.random() < 0.24,
    });
  }
  return out;
}

function drop(a: Assembly, index: number): void {
  clearTimeout(a.safety);
  reset(a.el);
  active.splice(index, 1);
}
function remove(a: Assembly): void {
  const i = active.indexOf(a);
  if (i >= 0) drop(a, i);
}

function frame(now: number): void {
  raf = 0;
  if (!ctx || !canvas) return;
  // Clear with the transform RESET: clearRect takes USER coordinates, so clearing (0,0,canvas.width,
  // canvas.height) under the dpr transform only wipes the top-left 1/dpr of the canvas, leaving the
  // right and bottom strips to accumulate overdraw at any dpr ≠ 1 (browser zoom, display scaling).
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cRect = canvas.getBoundingClientRect();
  for (let s = active.length - 1; s >= 0; s--) {
    const a = active[s]!;
    if (!a.el.isConnected) {
      drop(a, s);
      continue;
    }
    const rect = a.el.getBoundingClientRect();
    if (rect.width < 1) continue; // not laid out yet — the block is held at opacity 0; wait
    // The anchor ring: the block's box pushed out by a small MARGIN, so the web hugs the border.
    const rx = rect.left - cRect.left - MARGIN;
    const ry = rect.top - cRect.top - MARGIN;
    const rw = rect.width + MARGIN * 2;
    const rh = rect.height + MARGIN * 2;
    if (a.start === null) {
      a.start = now;
      a.nodes = buildNodes(2 * (rw + rh));
    }
    const g = clamp((now - a.start) / DUR, 0, 1);
    // Drop BEFORE drawing at the end, so the last visible frame is a fading web and the frame that ends
    // the run draws nothing — no strand left frozen on the canvas (the old "frame won't disappear" bug).
    if (g >= 1) {
      drop(a, s);
      continue;
    }

    // The message resolves inside the web as it weaves. The block itself just fades up (a hair of blur)
    // the light it wears is an INNER glow painted on the canvas over the card (see below) that drains
    // clear — no outer flash, which on every message would strobe the viewer.
    const co = clamp((g - 0.34) / 0.26, 0, 1);
    a.el.style.opacity = co <= 0 ? '0' : co >= 1 ? '1' : co.toFixed(3);
    a.el.style.filter = co >= 1 ? '' : `blur(${((1 - co) * 1.6).toFixed(2)}px)`;

    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    const maxd = Math.max(rw, rh);
    const n = a.nodes!.length;

    // Inner glow: the card arrives FLOODED with the web's mint light, which then drains away. A soft
    // ellipse over the block itself (its real rect, not the inflated ring), drawn here so it sits over
    // the card and UNDER the web — brightest as the message lands, gone by the time the web lifts. This
    // is the gentle-on-the-eyes replacement for the old outer flash.
    const floodA = clamp((g - 0.34) / 0.1, 0, 1) * (1 - clamp((g - 0.94) / 0.32, 0, 1));
    if (floodA > 0.01) {
      const gx = rect.left - cRect.left + rect.width / 2;
      const gy = rect.top - cRect.top + rect.height / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = clamp(floodA * 0.12, 0, 1);
      ctx.translate(gx, gy);
      ctx.scale(rect.width * 0.62, rect.height * 0.74);
      const fg = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      fg.addColorStop(0, `rgba(${a.rgb},0.85)`);
      fg.addColorStop(0.6, `rgba(${a.rgb},0.4)`);
      fg.addColorStop(1, `rgba(${a.rgb},0)`);
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Wind: the whole web sways and its threads billow, the gust building toward the end so it looks
    // blown loose as it dissolves. One shared direction, with a spatial phase so the gust TRAVELS
    // across the web instead of it pulsing as one lump.
    const windScale = 0.5 + 0.85 * g;
    const wind = (x: number, y: number, amp: number): [number, number] => {
      const ph = x * 0.023 + y * 0.017;
      const sway = 0.7 * Math.sin(now * 0.0037 + ph) + 0.3 * Math.sin(now * 0.0022 + ph * 1.7);
      const a2 = amp * windScale * sway;
      return [a2, a2 * 0.18]; // mostly sideways, a little downward
    };

    // Anchor positions on the ring, nudged only slightly by the wind — the anchors are pinned, so they
    // just tremble; the orbs fly to these and the threads hang between them.
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const p = perim(i, n, rx, ry, rw, rh);
      const w = wind(p[0], p[1], 2.2);
      pts.push([p[0] + w[0], p[1] + w[1]]);
    }

    // Web threads weave in as the orbs land, then fade with everything else at the end.
    const outA = 1 - clamp((g - 0.74) / 0.26, 0, 1);
    const webA = clamp((g - 0.34) / 0.16, 0, 1) * outA;
    if (webA > 0.01) {
      // A strand from i to j: bowed off the straight line by `bow` (of its distance from the centre —
      // positive bows OUT, negative bows IN), its belly then billowed by the wind at a bigger amplitude
      // than the anchors, so the threads move more than their pinned ends — a web catching a gust.
      const strand = (i: number, j: number, bow: number) => {
        const p = pts[i]!;
        const q = pts[j]!;
        const mx = (p[0] + q[0]) / 2;
        const my = (p[1] + q[1]) / 2;
        const w = wind(mx, my, 7);
        ctx!.moveTo(p[0], p[1]);
        ctx!.quadraticCurveTo(mx + (mx - cx) * bow + w[0], my + (my - cy) * bow + w[1], q[0], q[1]);
      };
      ctx.globalCompositeOperation = 'source-over';
      // The THREADS take the viewer's colour too, not just the orbs — otherwise a recoloured web still
      // read as mint everywhere the eye actually looks.
      ctx.strokeStyle = a.color;
      ctx.lineWidth = 1.1;
      ctx.shadowColor = a.color;
      ctx.shadowBlur = 6;
      // The border web: the ring hugging the edge + outward arcs layered over it.
      ctx.globalAlpha = clamp(webA * 0.55, 0, 1);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        strand(i, (i + 1) % n, 0.05); // the ring
        strand(i, (i + 2) % n, 0.16); // the outer arcs
      }
      ctx.stroke();
      // The inner net: longer chords crossing the message itself, a touch fainter so it reads as the
      // web's depth rather than clutter over the text.
      const inner = clamp(Math.round(n * 0.34), 3, n - 2);
      ctx.globalAlpha = clamp(webA * 0.4, 0, 1);
      ctx.beginPath();
      for (let i = 0; i < n; i++) strand(i, (i + inner) % n, -0.05);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // The orbs: stream in to their anchors, hold, then fade with the web. Each is a soft halo with a
    // crisp core on top (see the sprites) — a will-o'-wisp, not a smudge.
    for (let i = 0; i < n; i++) {
      const nd = a.nodes![i]!;
      const tg = pts[i]!;
      const ox = cx + Math.cos(nd.ang) * maxd * nd.rf;
      const oy = cy + Math.sin(nd.ang) * maxd * nd.rf * 0.7;
      const inT = clamp((g - 0.04 - nd.delay) / 0.4, 0, 1);
      const e = easeOut(inT);
      const px = lerp(ox, tg[0], e);
      const py = lerp(oy, tg[1], e);
      const fin = clamp((g - nd.delay) / 0.1, 0, 1);
      const tw = 0.72 + 0.28 * Math.sin(now * 0.007 + nd.tw);
      const alpha = clamp(fin * outA * tw, 0, 1);
      if (alpha <= 0.01) continue;
      const col = nd.accent ? a.accent : a.color;
      const halo = 14 + 10 * nd.sz;
      ctx.globalAlpha = alpha * 0.5;
      ctx.drawImage(glowSpriteFor(col), px - halo / 2, py - halo / 2, halo, halo);
      const core = 3 + 2.4 * nd.sz;
      ctx.globalAlpha = alpha;
      ctx.drawImage(coreSpriteFor(col), px - core / 2, py - core / 2, core, core);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  if (active.length) raf = requestAnimationFrame(frame);
}

function play(
  el: HTMLElement,
  mount: HTMLElement = document.body,
  color?: string,
): (() => void) | void {
  if (typeof document === 'undefined') return; // server-safe: the module can be imported anywhere
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  ensureCanvas(mount);
  // Hide the block until the web weaves it in (applyEntrance runs before it is painted, so no flash).
  el.style.opacity = '0';
  const base = color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_COLOR;
  const [br, bg, bb] = hexToRgb(base);
  // Keep the accent a HEX string — the sprite cache keys on it and parses it with hexToRgb.
  const pale = (v: number) =>
    Math.round(v + (255 - v) * 0.55)
      .toString(16)
      .padStart(2, '0');
  const a: Assembly = {
    el,
    color: base,
    accent: `#${pale(br)}${pale(bg)}${pale(bb)}`,
    rgb: `${br},${bg},${bb}`,
    nodes: null,
    start: null,
    safety: setTimeout(() => remove(a), DUR + 1500),
  };
  active.push(a);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => remove(a);
}

export const entranceAstral: EntranceModule = {
  id: 'entrance-astral',
  type: 'entrance',
  // Mid shelf: a real particle showpiece like the portal, but it wraps the message in a web of light in
  // place rather than driving a block out through a wormhole — priced below the portal, above glitch.
  costDust: 3000,
  fx: 'astral',
  labels: { name: 'shop.entranceAstral', desc: 'shop.entranceAstralDesc' },
  play,
  // No `css`: the whole effect is JS (opacity on the block, canvas for the web). data-fx only needs to
  // EXIST so the surface's own default entrance (:not([data-fx])) stands down.
};
