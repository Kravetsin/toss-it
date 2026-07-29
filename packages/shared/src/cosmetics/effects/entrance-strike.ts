import type { EntranceModule } from '../types';

/**
 * A bolt comes down out of the top of the frame and the message is simply THERE in the flash it made
 * — no fade, no slide. For the next second the charge is still in the block: arcs crawl around its
 * contour and sparks drop away from the point of impact.
 *
 * The arrival is the FLASH, not a movement, and that is the whole idea. Everything else in the
 * category travels (a portal drives the block out, echo's copies converge, warp unfolds); this one
 * makes the block appear between two frames and spends its remaining second proving something hit it.
 *
 * WHY JS + A CANVAS IN FRONT:
 * - The bolt is generated geometry — a jagged path regenerated a few times during the flash, because a
 *   bolt that holds one shape reads as a drawn asset. Nothing in CSS does that.
 * - The arcs ride the block's REAL bounding rect (perimeter walk, like entrance-astral's anchors), so
 *   they fit a one-word pill and a wrapped multi-line post without a shape to stretch.
 * - The layer sits ON TOP: an arc crawling the contour is only readable over the block, and the bolt
 *   ends AT its top edge. Behind it (the portal's layout) the arcs would be eaten by an opaque card.
 *
 * The impact point is off-centre (62% of the width) on purpose — dead centre reads as an aimed UI
 * animation, off-centre reads as weather.
 *
 * Per-frame jitter on the arcs, where the other engines precompute their particles' traits: an arc IS
 * noise, and the eye reads a smoothly moving one as a worm. Only the arcs get this; the sparks and the
 * bolt's own seed are stable, so nothing else flickers.
 *
 * STAYING NEXT TO THE BLOCK IN A MOUNTED SURFACE. The layer is `fixed`, so it fills the nearest
 * transformed ancestor — in the shop that is the whole Drawer PANEL, not the row that hosted it. Every
 * other engine got away with that by drawing only within a block's own neighbourhood; a bolt starts at
 * the TOP OF THE LAYER, so it flew down the length of the shop across every card. So when `mount` is
 * not the body, the run is clipped to the BLOCK's box plus a block-height of air, and the bolt falls
 * from the top of that — a short strike into its own message rather than a long one down the page.
 * Deliberately NOT clipped to the mount: a demo row is only as tall as the block and its left edge is
 * the block's own, so that bound cropped one side of an effect and left the other wide open. Nothing
 * changes on the overlays (body mount, no clip) — there the bolt comes out of the top of the screen.
 *
 * Reduced motion is honoured in applyEntrance (no data-fx, no play) and again here for direct callers
 * like the shop preview.
 */

const DUR = 1250; // ms — strike → the message lands → the charge bleeds off
// Brand mint default. NOT --color-accent (a cosmetic belongs to the viewer and must look identical on
// every surface); overridden per viewer by the entrance-colour upgrade.
const DEFAULT_COLOR = '#8df0cc';
const BOLT_REDRAW = 45; // ms between regenerated bolt shapes during the flash
const TAU = Math.PI * 2;

interface Spark {
  a: number; // launch angle, biased upward off the impact
  v: number; // launch speed, px per unit life
  sz: number; // base size
  ph: number; // launch offset after the strike
}
interface Strike {
  el: HTMLElement;
  /** Surface the run may not draw outside of (see the header), or null on the body-level layer. */
  clipTo: HTMLElement | null;
  color: string;
  sprite: HTMLCanvasElement | null; // glow sprite for `color`, built on the first laid-out frame
  sparks: Spark[] | null;
  seed: number; // fixes this bolt's silhouette so redraws are variations, not new bolts
  bolt: [number, number][] | null; // current jagged path, regenerated every BOLT_REDRAW
  boltAt: number; // when `bolt` was generated
  start: number | null;
  safety: ReturnType<typeof setTimeout>;
}

function reset(el: HTMLElement): void {
  el.style.opacity = '';
  el.style.filter = '';
}
function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
/** A point at parameter i/n around a rect's perimeter, walking the four edges in order. */
function perim(d: number, x: number, y: number, w: number, h: number): [number, number] {
  const tot = 2 * (w + h);
  let t = ((d % tot) + tot) % tot;
  if (t < w) return [x + t, y];
  t -= w;
  if (t < h) return [x + w, y + t];
  t -= h;
  if (t < w) return [x + w - t, y + h];
  return [x, y + h - (t - w)];
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let dpr = 1;
let resizeBound = false;
const active: Strike[] = [];
const spriteCache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A glow sprite tinted to `color`: white-hot core fading out through the colour. Cached — a viewer
 *  keeps one colour and every spark reuses the same sprite. */
function spriteFor(color: string): HTMLCanvasElement {
  const cached = spriteCache.get(color);
  if (cached) return cached;
  const [r, g, b] = hexToRgb(color);
  const s = document.createElement('canvas');
  s.width = s.height = 32;
  const c = s.getContext('2d')!;
  const grad = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, 32, 32);
  spriteCache.set(color, s);
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
  if (canvas) canvas.remove(); // mount changed (e.g. the shop drawer re-opened) — re-host the layer
  canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const st = canvas.style;
  st.position = 'fixed';
  st.left = '0';
  st.top = '0';
  st.width = '100%';
  st.height = '100%';
  st.pointerEvents = 'none';
  // IN FRONT of the message (see the header): a high z-index on the transparent overlays, and just
  // above the lifted block inside an opaque mounted surface (the shop drawer's isolated row).
  st.zIndex = mount === document.body ? '2147483000' : '2';
  mount.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  if (!resizeBound) {
    window.addEventListener('resize', resize);
    resizeBound = true;
  }
}

/**
 * The bolt from `(x0, y0)` down to the impact. Sine-driven off `seed` rather than Math.random, so a
 * redraw keeps the same broad shape and only re-breaks it — random points every 45ms is a different
 * bolt each time, which reads as three strikes instead of one flickering.
 */
function buildBolt(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: number,
): [number, number][] {
  const segs = 11;
  const spread = Math.max(14, Math.abs(y1 - y0) * 0.14);
  const out: [number, number][] = [[x0, y0]];
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    // Taper the deviation to zero at both ends: the bolt has to actually MEET the block, and a path
    // that misses its own impact point is the tell that this is drawn, not struck.
    const taper = Math.sin(t * Math.PI);
    out.push([
      x0 + (x1 - x0) * t + Math.sin(seed + i * 2.7) * spread * taper,
      y0 + (y1 - y0) * t + Math.cos(seed + i * 1.9) * spread * 0.3,
    ]);
  }
  out.push([x1, y1]);
  return out;
}

function strokePath(path: [number, number][]): void {
  ctx!.beginPath();
  ctx!.moveTo(path[0]![0], path[0]![1]);
  for (let i = 1; i < path.length; i++) ctx!.lineTo(path[i]![0], path[i]![1]);
  ctx!.stroke();
}

function buildSparks(w: number): Spark[] {
  const n = clamp(Math.round(w * 0.09), 14, 34); // scales with the block, like the other engines
  const out: Spark[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      // Fanned upward off the impact — thrown back the way the bolt came, then pulled down by gravity.
      a: -Math.PI / 2 + (Math.random() - 0.5) * 2.7,
      v: 60 + Math.random() * 190,
      sz: 1 + Math.random() * 1.8,
      ph: Math.random() * 0.1,
    });
  }
  return out;
}

function drop(s: Strike, index: number): void {
  clearTimeout(s.safety);
  reset(s.el);
  active.splice(index, 1);
}
function remove(s: Strike): void {
  const i = active.indexOf(s);
  if (i >= 0) drop(s, i);
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
  for (let i = active.length - 1; i >= 0; i--) {
    const s = active[i]!;
    if (!s.el.isConnected) {
      drop(s, i);
      continue;
    }
    const rect = s.el.getBoundingClientRect();
    if (rect.width < 1) continue; // not laid out yet — the block is held at opacity 0; wait
    if (s.start === null) {
      s.start = now;
      s.sparks = buildSparks(rect.width);
      s.sprite = spriteFor(s.color);
    }
    const g = clamp((now - s.start) / DUR, 0, 1);
    // Drop BEFORE drawing at the end, so the frame that ends the run leaves nothing on the canvas.
    if (g >= 1) {
      drop(s, i);
      continue;
    }

    const bx = rect.left - cRect.left;
    const by = rect.top - cRect.top;
    const bw = rect.width;
    const bh = rect.height;
    const hitX = bx + bw * 0.62;

    // Confine the run to the BLOCK's own box plus a little air, and let the bolt fall from the top of
    // that. save()/restore() wraps the WHOLE iteration, so the clip can never leak into the next strike.
    ctx.save();
    let skyY = -8;
    if (s.clipTo) {
      const up = Math.max(36, bh); // the bolt's whole visible run
      const pad = Math.max(18, bh * 0.5); // room for the bloom and the first sparks
      ctx.beginPath();
      ctx.rect(bx - pad, by - up, bw + pad * 2, bh + up + pad);
      ctx.clip();
      skyY = by - up - 6;
    }

    // The message is simply THERE once the bolt lands, cooling out of white over a few frames. No
    // fade-in: a bolt that lands on a half-transparent card is a bolt that hit nothing.
    const lit = clamp((g - 0.14) / 0.07, 0, 1);
    s.el.style.opacity = g < 0.14 ? '0' : '1';
    s.el.style.filter = lit >= 1 ? '' : `brightness(${(1 + (1 - lit) * 2.8).toFixed(2)})`;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = s.color;

    // 1) THE BOLT. Ramps up over the first frames, then decays — and while it is bright the shape is
    //    regenerated, which is what makes it flicker instead of hanging there.
    const boltA = g < 0.14 ? clamp(g / 0.05, 0, 1) : clamp(1 - (g - 0.14) / 0.16, 0, 1);
    if (boltA > 0.01) {
      if (!s.bolt || now - s.boltAt > BOLT_REDRAW) {
        s.bolt = buildBolt(hitX + 30, skyY, hitX, by, s.seed + (now - s.start!) * 0.004);
        s.boltAt = now;
      }
      ctx.shadowBlur = 18;
      ctx.globalAlpha = clamp(boltA * 0.35, 0, 1);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 6;
      strokePath(s.bolt); // the halo pass, wide and dim
      ctx.globalAlpha = boltA;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      strokePath(s.bolt); // the core pass, thin and white-hot
      ctx.shadowBlur = 0;
    }

    // 2) IMPACT BLOOM — one big sprite at the point of contact, gone in a fifth of a second. This is
    //    what carries the "it hit HERE" over any stream; the bolt alone reads as a passing flicker.
    const bloom = clamp(1 - Math.abs(g - 0.15) / 0.12, 0, 1);
    if (bloom > 0.01) {
      const size = (40 + bh * 1.6) * bloom;
      ctx.globalAlpha = bloom * 0.85;
      ctx.drawImage(s.sprite!, hitX - size / 2, by - size / 2, size, size);
    }

    // 3) RESIDUAL ARCS crawling the contour. Three of them, each a short jagged run along the
    //    perimeter, travelling at their own offset so the charge circles the block rather than sitting.
    const arcA = clamp((g - 0.16) / 0.1, 0, 1) * clamp(1 - (g - 0.55) / 0.4, 0, 1);
    if (arcA > 0.01) {
      const tot = 2 * (bw + bh);
      ctx.globalAlpha = arcA;
      ctx.strokeStyle = s.color;
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1.3;
      for (let k = 0; k < 3; k++) {
        const d0 = (g * 1.7 + k / 3) * tot;
        const path: [number, number][] = [];
        for (let p = 0; p <= 6; p++) {
          const pt = perim(d0 + p * 13, bx, by, bw, bh);
          // Per-frame jitter: see the header — an arc is noise, a smooth one reads as a worm.
          path.push([pt[0] + (Math.random() - 0.5) * 3, pt[1] + (Math.random() - 0.5) * 3]);
        }
        strokePath(path);
      }
      ctx.shadowBlur = 0;
    }

    // 4) SPARKS thrown back up the bolt's path, then pulled down. They outlive the arcs by a beat, so
    //    the last thing the eye sees is debris settling, not an effect switching off.
    for (const sp of s.sparks!) {
      const life = (g - 0.14 - sp.ph) / 0.55;
      if (life <= 0 || life >= 1) continue;
      const t = easeOut(life) * 0.55;
      const x = hitX + Math.cos(sp.a) * sp.v * t;
      const y = by + Math.sin(sp.a) * sp.v * t + 320 * t * t; // gravity wins over the launch
      const size = sp.sz * (1 - life * 0.5) * 3.2;
      ctx.globalAlpha = clamp((1 - life) * 0.9, 0, 1);
      ctx.drawImage(s.sprite!, x - size / 2, y - size / 2, size, size);
    }
    ctx.restore();
  }
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
  // Hold the block until the bolt lands (applyEntrance runs before it is painted, so no flash).
  el.style.opacity = '0';
  const s: Strike = {
    el,
    clipTo: mount === document.body ? null : mount,
    // Only a full #rrggbb is honoured; anything else (absent, malformed) falls back to the brand mint.
    color: color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_COLOR,
    sprite: null,
    sparks: null,
    seed: Math.random() * TAU,
    bolt: null,
    boltAt: 0,
    start: null,
    // If the element never lays out (removed mid-flight, a throttled background tab), don't leave the
    // message invisible forever.
    safety: setTimeout(() => remove(s), DUR + 1500),
  };
  active.push(s);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => remove(s);
}

export const entranceStrike: EntranceModule = {
  id: 'entrance-strike',
  type: 'entrance',
  // Top of the category, above the portal. Not a "more expensive because newer" price: it is the only
  // arrival that hits the block from OUTSIDE it, so it reads across the whole stage rather than around
  // a pill, and it keeps paying out for a second after the message has landed.
  costDust: 5000,
  since: '2026-07-29',
  fx: 'strike',
  labels: { name: 'shop.entranceStrike', desc: 'shop.entranceStrikeDesc' },
  play,
  // No `css`: the whole effect is JS (opacity on the block, canvas for the bolt). data-fx only needs
  // to EXIST so the surface's own default entrance (:not([data-fx])) stands down.
};
