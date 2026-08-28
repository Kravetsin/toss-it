import type { EntranceModule } from '../types';

/**
 * The message assembles from JIGSAW PIECES. Glass blanks with real interlocking knobs fly in from
 * around the block and snap into place; the content shows up only inside pieces that have landed.
 * The last piece takes its famous pause before arriving — and when it clicks, every seam flashes
 * once and the whole block gives a small satisfied pulse.
 *
 * HOW THE INNARDS STAY UNTOUCHED (the category's load-bearing rule): the block is revealed through
 * `clip-path: path(...)` whose value is the UNION of the landed pieces' outlines — adjacent
 * subpaths merge under nonzero winding, so each landing just appends one subpath to the clip
 * string. Nothing inside the message ever animates; the flying pieces on the canvas are the same
 * outlines but EMPTY — content exists only in its final place.
 *
 * The grid is derived from the block (≈56px columns, ≈40px rows, capped), and neighbouring cells
 * SHARE each knob's sign, so the tabs genuinely interlock — a chat pill gets a 1-row strip of
 * pieces, a tall alert a 3-row mosaic, from the same code.
 *
 * Flight starts stay NEAR the block (a clamped radial offset), not at the screen edge: on a shop
 * or stage surface the run is clipped to a zone around the block (see entrance-strike's hosting
 * lesson), and a piece born far outside it would pop in at the clip boundary.
 */

const T0 = 120; // ms before the first piece launches
const STAGGER = 850; // ms across which the pieces (except the last) launch
const FLIGHT = 420; // ms one piece is in the air
const LAST_PAUSE = 400; // the classic wait before the final piece
const TAIL = 450; // ms after the last landing (joint flash + pulse)
const DEFAULT_COLOR = '#8df0cc';

interface Piece {
  d: string; // block-local outline; feeds both the clip-path union and the canvas Path2D
  path: Path2D;
  cx: number; // centroid, block-local — the flight rotates around it
  cy: number;
  fromX: number; // where the flight starts, as an offset from the resting place
  fromY: number;
  rot0: number;
  t0: number; // launch, ms into the run
  land: number;
}
interface Run {
  el: HTMLElement;
  /** Surface the run may not draw outside of, or null on the body-level layer. See entrance-strike. */
  clipTo: HTMLElement | null;
  color: string;
  rgb: [number, number, number];
  pieces: Piece[] | null;
  allT: number;
  durMs: number;
  start: number | null;
  landedCount: number; // how many subpaths the current clip string holds — rebuilt only on change
  safety: ReturnType<typeof setTimeout>;
}

function setClip(el: HTMLElement, v: string): void {
  el.style.clipPath = v;
  (el.style as unknown as Record<string, string>).webkitClipPath = v;
}
function reset(el: HTMLElement): void {
  el.style.transform = '';
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

/** One jigsaw edge: straight on the border, a mushroom knob inside; `sign` says who owns the tab. */
function jigsawEdge(x1: number, y1: number, x2: number, y2: number, sign: number): string {
  if (!sign) return `L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * sign;
  const ny = (dx / len) * sign;
  const k = Math.min(34, len * 0.24);
  const P = (t: number, off: number): string =>
    `${(x1 + dx * t + nx * k * off).toFixed(1)} ${(y1 + dy * t + ny * k * off).toFixed(1)}`;
  return (
    `L${P(0.34, 0)}` +
    `C${P(0.44, 0)} ${P(0.3, 0.8)} ${P(0.37, 0.9)}` +
    `C${P(0.44, 1.7)} ${P(0.56, 1.7)} ${P(0.63, 0.9)}` +
    `C${P(0.7, 0.8)} ${P(0.56, 0)} ${P(0.66, 0)}` +
    `L${x2.toFixed(1)} ${y2.toFixed(1)}`
  );
}

function buildPieces(bw: number, bh: number): [Piece[], number] {
  const cols = Math.round(clamp(bw / 56, 3, 7));
  const rows = Math.round(clamp(bh / 40, 1, 3));
  const cw = bw / cols;
  const ch = bh / rows;
  // Knob ownership per internal edge; neighbours read the same entry, so the tabs interlock.
  const vKnob: Record<string, number> = {};
  const hKnob: Record<string, number> = {};
  for (let c = 1; c < cols; c++)
    for (let r = 0; r < rows; r++) vKnob[`${c},${r}`] = Math.random() < 0.5 ? 1 : -1;
  for (let r = 1; r < rows; r++)
    for (let c = 0; c < cols; c++) hKnob[`${c},${r}`] = Math.random() < 0.5 ? 1 : -1;
  const cells: (Piece & { order: number })[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = c * cw;
      const y0 = r * ch;
      const x1 = x0 + cw;
      const y1 = y0 + ch;
      const d =
        `M${x0.toFixed(1)} ${y0.toFixed(1)}` +
        jigsawEdge(x0, y0, x1, y0, r > 0 ? hKnob[`${c},${r}`]! : 0) +
        jigsawEdge(x1, y0, x1, y1, c < cols - 1 ? vKnob[`${c + 1},${r}`]! : 0) +
        jigsawEdge(x1, y1, x0, y1, r < rows - 1 ? -hKnob[`${c},${r + 1}`]! : 0) +
        jigsawEdge(x0, y1, x0, y0, c > 0 ? -vKnob[`${c},${r}`]! : 0) +
        'Z';
      // Radial launch point near the block (clamped — see the header), scattered a little so a
      // one-row strip doesn't send every piece along the same horizontal.
      const ang =
        Math.atan2(y0 + ch / 2 - bh / 2, x0 + cw / 2 - bw / 2) + (Math.random() - 0.5) * 0.9;
      const dist = clamp(bh * 1.5, 80, 170) + Math.random() * 40;
      cells.push({
        d,
        path: new Path2D(d),
        cx: x0 + cw / 2,
        cy: y0 + ch / 2,
        fromX: Math.cos(ang) * dist,
        fromY: Math.sin(ang) * dist,
        rot0: (Math.random() - 0.5) * 0.9,
        t0: 0,
        land: 0,
        order: Math.random(),
      });
    }
  }
  cells.sort((a, b) => a.order - b.order);
  const step = STAGGER / cells.length;
  cells.forEach((cell, i) => {
    cell.t0 = T0 + i * step + (i === cells.length - 1 ? LAST_PAUSE : 0);
    cell.land = cell.t0 + FLIGHT;
  });
  return [cells, cells[cells.length - 1]!.land];
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let dpr = 1;
let resizeBound = false;
const active: Run[] = [];

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
  // In front: flying blanks pass over whatever already sits on the surface, then vanish into it.
  st.zIndex = mount === document.body ? '2147483000' : '2';
  mount.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  if (!resizeBound) {
    window.addEventListener('resize', resize);
    resizeBound = true;
  }
}

function drop(t: Run, index: number): void {
  clearTimeout(t.safety);
  reset(t.el);
  active.splice(index, 1);
}
function remove(t: Run): void {
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
      [t.pieces, t.allT] = buildPieces(rect.width, rect.height);
      t.durMs = t.allT + TAIL;
    }
    const ms = now - t.start;
    if (ms >= t.durMs) {
      drop(t, i);
      continue;
    }
    const bx = rect.left - cRect.left;
    const by = rect.top - cRect.top;
    const bh = rect.height;
    const pieces = t.pieces!;

    // The clip: a union of landed outlines, rebuilt only when a new piece lands. Before the first
    // landing an empty-polygon clip hides everything; after the last, the clip is lifted entirely.
    const landed = pieces.filter((p) => ms >= p.land);
    if (landed.length !== t.landedCount) {
      t.landedCount = landed.length;
      setClip(
        t.el,
        landed.length === pieces.length
          ? 'none'
          : landed.length
            ? `path('${landed.map((p) => p.d).join(' ')}')`
            : 'polygon(0 0, 0 0, 0 0)',
      );
    }
    // The click of the final piece: one short pulse of the whole, then the transform is cleared.
    const jf = ms - t.allT;
    if (jf >= 0 && jf < 220) {
      const pulse = Math.sin((jf / 220) * Math.PI) * 0.028;
      t.el.style.transform = `scale(${(1 + pulse).toFixed(4)})`;
    } else if (t.el.style.transform) {
      t.el.style.transform = '';
    }

    ctx.save();
    if (t.clipTo) {
      const pad = Math.max(40, bh);
      ctx.beginPath();
      ctx.rect(bx - pad, by - pad, rect.width + pad * 2, bh + pad * 2);
      ctx.clip();
    }
    const [r, g, b] = t.rgb;
    ctx.lineJoin = 'round';
    for (const p of pieces) {
      if (ms >= p.t0 && ms < p.land) {
        const u = (ms - p.t0) / FLIGHT;
        const e = 1 - Math.pow(1 - u, 3);
        ctx.save();
        ctx.translate(bx + p.fromX * (1 - e), by + p.fromY * (1 - e));
        ctx.translate(p.cx, p.cy);
        ctx.rotate(p.rot0 * (1 - e));
        const s = 1 + 0.08 * (1 - e);
        ctx.scale(s, s);
        ctx.translate(-p.cx, -p.cy);
        // An empty glass blank: translucent body, soft halo, bright rim — and no content.
        ctx.fillStyle = `rgba(${r},${g},${b},0.1)`;
        ctx.fill(p.path);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.25)`;
        ctx.lineWidth = 3.5;
        ctx.stroke(p.path);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.9)`;
        ctx.lineWidth = 1.2;
        ctx.stroke(p.path);
        ctx.restore();
      }
      const fl = ms - p.land;
      if (fl >= 0 && fl < 180) {
        ctx.save();
        ctx.translate(bx, by);
        ctx.strokeStyle = `rgba(255,255,255,${(0.8 * (1 - fl / 180)).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke(p.path);
        ctx.restore();
      }
    }
    // Once the last piece clicks in, every seam lights up together — the "it is whole now" beat.
    if (jf >= 50 && jf < 300) {
      ctx.save();
      ctx.translate(bx, by);
      ctx.strokeStyle = `rgba(${r},${g},${b},${(0.7 * (1 - (jf - 50) / 250)).toFixed(3)})`;
      ctx.lineWidth = 1;
      for (const p of pieces) ctx.stroke(p.path);
      ctx.restore();
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
  // Hidden until the first piece lands; the frame loop swaps this for the growing union.
  setClip(el, 'polygon(0 0, 0 0, 0 0)');
  const c = color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_COLOR;
  const t: Run = {
    el,
    clipTo: mount === document.body ? null : mount,
    color: c,
    rgb: hexToRgb(c),
    pieces: null,
    allT: 0,
    durMs: T0 + STAGGER + LAST_PAUSE + FLIGHT + TAIL, // upper bound until the real grid is known
    start: null,
    landedCount: -1,
    safety: setTimeout(() => remove(t), T0 + STAGGER + LAST_PAUSE + FLIGHT + TAIL + 1500),
  };
  active.push(t);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => remove(t);
}

export const entrancePuzzle: EntranceModule = {
  id: 'entrance-puzzle',
  type: 'entrance',
  // Above the lotus, below the strike: a showpiece with a story beat (the last piece's pause).
  costDust: 4500,
  since: '2026-08-28',
  fx: 'puzzle',
  labels: { name: 'shop.entrancePuzzle', desc: 'shop.entrancePuzzleDesc' },
  play,
  // No `css`: the whole effect is JS (clip-path union on the block, canvas for the flying blanks).
  // data-fx only needs to EXIST so the surface's default entrance (:not([data-fx])) stands down.
};
