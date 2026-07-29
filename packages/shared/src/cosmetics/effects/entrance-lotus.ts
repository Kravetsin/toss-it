import type { EntranceModule } from '../types';

/**
 * A lotus opens and the message is what was folded inside it. Two halves of a bud swing aside and the
 * block unrolls out of the seam between them, while behind it the rest of the flower lays itself out —
 * five broad petals rising into a crown above the message.
 *
 * TWO LAYERS, ONE CANVAS. The wreath belongs BEHIND the message and the bud halves in FRONT of it, and
 * a single `fixed` layer cannot be both. So the back petals are drawn with the message punched out of
 * the clip (`clip('evenodd')`) — the same trick that sends entrance-tide's ripples behind the block —
 * and the front pair is painted normally on top afterwards. The hole is the message's VISIBLE part, so
 * before the seam parts there is nothing to hide behind and the flower is whole.
 *
 * THE PETAL IS THE WHOLE THING, and it is a proportion, not a size: a drawn lotus petal is about HALF
 * as wide as it is long. Sizing the width against the block instead gave a seventh, and the flower came
 * out as a ring of thorns. Straight and symmetric, too — a curled tip reads as a claw — with a second,
 * smaller outline inset inside the first, which is what every drawn lotus does and what separates a
 * petal from a leaf (a leaf has a centre vein; a petal has an inner contour).
 *
 * THE FLOWER IS A FIXED SIZE — it does not scale with the message at all, and both attempts to make it
 * do so were wrong. Width was never allowed in (that stretches the flower into an oval, the mistake
 * entrance-portal's ring is built to avoid). Height was, and on a four-line message that grew a crown
 * tall enough to bury the rest of the chat: the effect belongs to ONE viewer and may not take the
 * screen from everyone else. So the wreath is rooted just inside the TOP edge and the bud halves at the
 * BOTTOM one, each a constant `UNIT` across — the flower is the same object on a one-word pill and on a
 * wall of text, sitting on a taller card instead of growing to match it. The only thing the block's own
 * size still moves is how far the doors travel apart, which is the message unrolling, not the flower.
 *
 * WHY THE ROWS FAN UPWARD rather than ringing the block: on a wide message the side petals of a full
 * ring are simply covered by it, so half the flower does no work. Aimed up, every tip clears the top
 * edge. The upper row has an ODD count so one petal stands exactly vertical — that centre petal is what
 * is recognised as a lotus before any of the others are read.
 *
 * Reduced motion is honoured in applyEntrance (no data-fx, no play) and again here for direct callers
 * like the shop preview.
 */

const DUR = 1700; // ms — the bud parts, the flower lays out, the petals let go
const DEFAULT_COLOR = '#8df0cc';
const HALF_PI = Math.PI / 2;
/**
 * The petal unit, in px — every length in the flower is a multiple of it (see the header for why it is
 * a constant and not a fraction of the block). Tuned against a chat pill, which is the surface the
 * effect plays on most: the crown ends up standing ~46px above the message's top edge whatever the
 * message is. Raising it enlarges the whole flower on every surface at once.
 */
const UNIT = 32;

/**
 * The wreath behind the message, outer row first so the inner ones layer over it. `len` and `ratio` are
 * in block-heights and in fractions of the petal's own length — see the header for why the second one
 * is the load-bearing number.
 */
const ROWS = [
  {
    n: 2,
    from: -Math.PI * 0.87,
    to: -Math.PI * 0.13,
    len: 1.4,
    ratio: 0.7,
    dim: 0.92,
    weight: 0.95,
  },
  { n: 3, from: -Math.PI * 0.68, to: -Math.PI * 0.32, len: 1.95, ratio: 0.5, dim: 1, weight: 1 },
];

interface Lotus {
  el: HTMLElement;
  /** Surface the run may not draw outside of, or null on the body-level layer. See entrance-strike. */
  clipTo: HTMLElement | null;
  /** The tint as "r,g,b", for the rgba() the petals are painted with. */
  rgb: string;
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
/** Slow at both ends: a flower does not snap open, and it does not stop dead either. */
function easeIO(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let dpr = 1;
let resizeBound = false;
const active: Lotus[] = [];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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
  // IN FRONT of the message: the bud halves have to pass over its edges as they swing aside. What
  // belongs behind is put there by the punch-out instead (see the header).
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
 * One petal: base at (x, y), tip `len` away along `ang`, `wid` across at its widest. Two quadratics
 * mirrored about the axis — the control offset IS the drawn width (a quadratic reaches half its
 * control offset, on both sides), so `wid` can be read straight off a reference drawing.
 */
function petalPath(
  x: number,
  y: number,
  ang: number,
  len: number,
  wid: number,
  curl: number,
): void {
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const nx = -sin;
  const ny = cos;
  ctx!.beginPath();
  ctx!.moveTo(x, y);
  ctx!.quadraticCurveTo(
    x + cos * len * 0.42 + nx * wid,
    y + sin * len * 0.42 + ny * wid,
    x + cos * len + nx * curl,
    y + sin * len + ny * curl,
  );
  ctx!.quadraticCurveTo(x + cos * len * 0.42 - nx * wid, y + sin * len * 0.42 - ny * wid, x, y);
  ctx!.closePath();
}

function paintPetal(
  rgb: string,
  x: number,
  y: number,
  ang: number,
  len: number,
  wid: number,
  curl: number,
  alpha: number,
  weight: number,
): void {
  const c = ctx!;
  petalPath(x, y, ang, len, wid, curl);
  // Filled from the base outward: a petal is lit where it is thick and lets go at the tip. A flat fill
  // makes a broad petal read as a paper cut-out.
  const grad = c.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
  grad.addColorStop(0, `rgba(${rgb},${(alpha * 0.4 * weight).toFixed(3)})`);
  grad.addColorStop(0.55, `rgba(${rgb},${(alpha * 0.2 * weight).toFixed(3)})`);
  grad.addColorStop(1, `rgba(${rgb},${(alpha * 0.03).toFixed(3)})`);
  c.fillStyle = grad;
  c.fill();
  c.strokeStyle = `rgba(${rgb},${(alpha * 0.85 * weight).toFixed(3)})`;
  c.lineWidth = 1.1;
  c.shadowColor = `rgba(${rgb},0.5)`;
  c.shadowBlur = 9;
  c.stroke();
  c.shadowBlur = 0;
  // The inner contour — a smaller petal of the same shape, not a centre vein. See the header.
  petalPath(x, y, ang, len * 0.6, wid * 0.6, curl * 0.6);
  c.strokeStyle = `rgba(${rgb},${(alpha * 0.34 * weight).toFixed(3)})`;
  c.lineWidth = 0.8;
  c.stroke();
}

function drop(l: Lotus, index: number): void {
  clearTimeout(l.safety);
  reset(l.el);
  active.splice(index, 1);
}
function remove(l: Lotus): void {
  const i = active.indexOf(l);
  if (i >= 0) drop(l, i);
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
    const l = active[i]!;
    if (!l.el.isConnected) {
      drop(l, i);
      continue;
    }
    const rect = l.el.getBoundingClientRect();
    if (rect.width < 1) continue; // not laid out yet — the block is clipped shut; wait
    if (l.start === null) l.start = now;
    const ms = now - l.start;
    // Drop BEFORE drawing at the end, so the frame that ends the run leaves nothing on the canvas.
    if (ms >= DUR) {
      drop(l, i);
      continue;
    }
    const g = ms / DUR;

    const bx = rect.left - cRect.left;
    const by = rect.top - cRect.top;
    const bw = rect.width;
    const bh = rect.height;
    const cx = bx + bw / 2;

    // The seam. Everything else keys off it, including the punch-out, so it is computed first.
    const open = easeIO(clamp((g - 0.12) / 0.5, 0, 1));
    const front = clamp((g - 0.76) / 0.24, 0, 1); // the bud halves letting go
    const back = clamp((g - 0.74) / 0.26, 0, 1); // ...and the wreath after them
    setClip(
      l.el,
      front >= 1
        ? 'none'
        : `inset(0 ${((1 - open) * 50).toFixed(2)}% 0 ${((1 - open) * 50).toFixed(2)}%)`,
    );

    ctx.save();
    if (l.clipTo) {
      // Bounded to the flower's own reach, so a mounted surface (the shop row) never gets an effect
      // running across its neighbours — the rule entrance-strike had to learn. Height plays no part:
      // the flower no longer grows with the block, only the doors' travel does (that is width).
      const up = UNIT * 2.6;
      const side = bw * 0.55 + UNIT * 2.4;
      ctx.beginPath();
      ctx.rect(cx - side, by - up, side * 2, bh + up + UNIT * 2.4);
      ctx.clip();
    }
    ctx.lineJoin = 'round';

    // 1) THE WREATH, behind the message. Closed, every petal points straight up in a bunch — that IS
    //    the closed bud, so there is no second shape to draw and the opening is honest.
    const spread = easeIO(clamp((g - 0.05) / 0.55, 0, 1));
    const wreathA = (1 - back) * clamp(g / 0.08, 0, 1);
    if (wreathA > 0.01) {
      ctx.save();
      const visW = bw * open;
      ctx.beginPath();
      ctx.rect(0, 0, cRect.width, cRect.height);
      if (visW > 1) ctx.rect(cx - visW / 2, by, visW, bh);
      ctx.clip('evenodd');
      // The fan is rooted just INSIDE the message's top edge, so the crown always stands the same
      // amount above it: a wreath rooted at the block's centre climbs with the block, which is what
      // buried a four-line message's neighbours.
      const baseY = by + UNIT * 0.5;
      for (const row of ROWS) {
        for (let k = 0; k < row.n; k++) {
          const bearing = row.from + (row.to - row.from) * (row.n === 1 ? 0.5 : k / (row.n - 1));
          const ang = -HALF_PI + (bearing + HALF_PI) * spread;
          const len = UNIT * (0.32 + (row.len - 0.32) * spread + back * 0.35);
          paintPetal(
            l.rgb,
            cx,
            baseY,
            ang,
            len,
            len * row.ratio * (0.72 + 0.28 * spread),
            0,
            wreathA * row.dim,
            row.weight,
          );
        }
      }
      ctx.restore();
    }

    // 2) THE BUD HALVES, in front. They swing aside and out, and the message unrolls between them.
    //    Rooted at the BOTTOM edge and a fixed size, for the same reason as the wreath: sized off the
    //    block they turned a tall message into a pair of petals the height of the chat.
    const budA = (1 - front) * clamp(g / 0.1, 0, 1);
    if (budA > 0.01) {
      const L = UNIT * 2;
      const W = L * 0.5;
      for (const dir of [-1, 1]) {
        paintPetal(
          l.rgb,
          cx + dir * open * bw * 0.42,
          by + bh + L * 0.06,
          -HALF_PI + dir * (0.06 + open * 1.5),
          L * (1 - front * 0.15),
          W,
          dir * W * 0.16,
          budA,
          1.25,
        );
      }
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
  // Shut until the seam parts. Percentages, not px: no width is known before the first laid-out frame,
  // and applyEntrance runs before paint, so there is no flash of the whole message.
  setClip(el, 'inset(0 50% 0 50%)');
  // Only a full #rrggbb is honoured; anything else (absent, malformed) falls back to the brand mint.
  const hex = color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_COLOR;
  const [r, g, b] = hexToRgb(hex);
  const l: Lotus = {
    el,
    clipTo: mount === document.body ? null : mount,
    rgb: `${r},${g},${b}`,
    start: null,
    // If the element never lays out (removed mid-flight, a throttled background tab), don't leave the
    // message clipped away forever.
    safety: setTimeout(() => remove(l), DUR + 1500),
  };
  active.push(l);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => remove(l);
}

export const entranceLotus: EntranceModule = {
  id: 'entrance-lotus',
  type: 'entrance',
  // Upper shelf, under the portal: a two-layer canvas piece that holds the message shut for half a
  // beat, where the portal is spectacle from the first frame and Strike is over in an instant.
  costDust: 4200,
  since: '2026-07-29',
  fx: 'lotus',
  labels: { name: 'shop.entranceLotus', desc: 'shop.entranceLotusDesc' },
  play,
  // No `css`: the whole effect is JS (a clip on the block, canvas for the flower). data-fx only needs
  // to EXIST so the surface's own default entrance (:not([data-fx])) stands down.
};
