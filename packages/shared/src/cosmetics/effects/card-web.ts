import type { CardEffectModule } from '../types';

/**
 * A web of light on the card: a STATIC glowing rectangle contour with little will-o'-wisp orbs on it,
 * and, strung between those orbs across the card's interior, threads that billow in a gentle wind.
 * (This is the entrance-astral web lifted onto a card as a persistent decoration.)
 *
 * WHY THE CONTOUR IS STATIC. An earlier version swayed the whole web — ring, orbs and all. On a card
 * that reads as a restless border and costs a wind calculation per anchor + per strand. So only the
 * INNER threads move now: the frame and its orbs sit still (the orbs just twinkle in brightness), and
 * the silk inside sways. That halves the moving geometry and calms the look — the effect the eye wants
 * anyway (a web caught in a still frame).
 *
 * WHY FEWER NODES ON SHORT CARDS. Node count came off the perimeter, so a wide-but-flat message pill
 * got a node every ~50px along its long top/bottom and read as an overstuffed grid. Short cards now
 * get a bigger node spacing, a lower cap, and sparser inner threads, so a flat block stays airy.
 *
 * WHY A `render` effect, PER-CARD canvas. A connected web whose threads billow between SHARED nodes
 * can't be CSS `.p` particles (a particle knows nothing of another's position). It hosts its own
 * canvas in the `.card-fx` layer — which must be per-card, not one global canvas: the layer sits
 * BEHIND the card's own content (in front of its background), a place a single viewport canvas can't
 * occupy without either covering the text or hiding behind the page.
 *
 * COST is bounded three ways beyond the static contour: the loop is throttled to ~30fps, an
 * IntersectionObserver pauses it while the card is off-screen, and a module-wide LIVE cap means only
 * the first few webs animate — the rest draw one static frame (identical look, zero ongoing cost). So
 * the total work can't grow without limit as the effect gets popular (the OBS-chat worst case).
 */

const COLOR = '#8df0cc'; // brand mint — NOT --color-accent (a cosmetic must look identical everywhere)
const ACCENT = '#cffff2'; // a paler mint, sprinkled through for a subtle two-tone glow
const WEAVE = 1300; // ms to fade the web in on mount
const MAX_LIVE = 8; // module-wide cap on webs that ANIMATE at once; beyond it, a static frame
const TAU = Math.PI * 2;

let live = 0; // how many webs are currently animating (see MAX_LIVE)

function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const spriteCache = new Map<string, HTMLCanvasElement>();
// Soft mint halo (the wisp's box-shadow).
function glowSprite(color: string): HTMLCanvasElement {
  const key = 'g|' + color;
  const c0 = spriteCache.get(key);
  if (c0) return c0;
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
// Crisp bright core disc — white centre, colour to ~86%, then a sharp drop (a clean edge).
function coreSprite(color: string): HTMLCanvasElement {
  const key = 'c|' + color;
  const c0 = spriteCache.get(key);
  if (c0) return c0;
  const [r, g, b] = hexToRgb(color);
  const s = document.createElement('canvas');
  s.width = s.height = 32;
  const c = s.getContext('2d')!;
  const grad = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.42, 'rgba(255,255,255,0.96)');
  grad.addColorStop(0.56, `rgba(${r},${g},${b},0.96)`);
  grad.addColorStop(0.86, `rgba(${r},${g},${b},0.92)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, 32, 32);
  spriteCache.set(key, s);
  return s;
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

interface Node {
  sz: number;
  tw: number;
  accent: boolean;
  /** How many nodes ahead this one strings a thread to — RANDOM per node, so the inner threads read
   *  as an organic web, not the regular star-polygon a fixed offset draws. */
  link: number;
}

function render(layer: HTMLElement, _surface: string, compact: boolean): (() => void) | void {
  if (typeof window === 'undefined') return;
  const cv = document.createElement('canvas');
  const st = cv.style;
  st.position = 'absolute';
  st.left = '0';
  st.top = '0';
  st.pointerEvents = 'none';
  cv.setAttribute('aria-hidden', 'true');
  layer.appendChild(cv);
  const ctx = cv.getContext('2d');
  if (!ctx) {
    cv.remove();
    return;
  }

  let W = 0;
  let H = 0;
  // Device-pixels-per-user-unit, set by fit() — draw() needs it to restore the transform after
  // clearing, and clearing MUST happen with the transform reset (see the note in draw()).
  let sx = 1;
  let sy = 1;
  function fit(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = layer.getBoundingClientRect();
    // Back the canvas with an INTEGER pixel grid and display it 1:1 (css size = backing / dpr). Sizing
    // the backing to a fractional device box (100% width at a fractional dpr — Windows display scaling)
    // let the browser upscale the canvas a hair, doubling the crisp contour's right & bottom edges.
    // CSS size floored to whole px so the canvas can NEVER be wider/taller than the layer (nothing to
    // spill past the clip); backing rounded to whole device px; and the context scaled by the EXACT
    // backing/css ratio rather than dpr, so no residual scale error is left for the browser to smear.
    const cssW = Math.max(1, Math.round(r.width));
    const cssH = Math.max(1, Math.round(r.height));
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    cv.width = bw;
    cv.height = bh;
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    sx = bw / cssW;
    sy = bh / cssH;
    ctx!.setTransform(sx, 0, 0, sy, 0, 0);
    W = cssW;
    H = cssH;
  }
  fit();
  // Calls refit (declared below) — the observer only ever fires after this function's body has run.
  const ro = new ResizeObserver(() => refit());
  ro.observe(layer);

  let nodes: Node[] | null = null;
  let start: number | null = null;

  function draw(now: number, still: boolean): void {
    // Clear with the transform RESET. clearRect takes USER coordinates, so `clearRect(0,0,cv.width,
    // cv.height)` under a scaled transform wipes only the top-left `scale` fraction of the canvas —
    // at any zoom but 100% (scale ≠ 1) the right and bottom strips were never cleared and accumulated
    // every frame's overdraw into thick static streaks and blobs on exactly those two edges.
    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(0, 0, cv.width, cv.height);
    ctx!.setTransform(sx, 0, 0, sy, 0, 0);
    if (W < 8 || H < 8) return;
    if (start === null) start = now;

    // Contour inset just inside the card edge so the layer's overflow clip never eats it.
    const M = compact ? 3 : 6;
    const rx = M;
    const ry = M;
    const rw = W - 2 * M;
    const rh = H - 2 * M;
    if (rw < 8 || rh < 8) return;

    // Fewer nodes on a short card — bigger spacing, lower cap — so a flat block stays airy.
    const shortCard = rh < 68;
    if (!nodes) {
      const spacing = shortCard ? 92 : 66;
      const maxN = shortCard ? 9 : 16;
      const n = clamp(Math.round((2 * (rw + rh)) / spacing), compact ? 5 : 7, maxN);
      // Bound the reach so no thread spans the whole card (that read as a starburst through the middle).
      const maxReach = Math.max(2, Math.round(n * 0.38));
      nodes = Array.from({ length: n }, () => ({
        sz: Math.random(),
        tw: Math.random() * TAU,
        accent: Math.random() < 0.24,
        link: 2 + Math.floor(Math.random() * maxReach),
      }));
    }
    const n = nodes.length;
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;
    const weave = clamp((now - start) / WEAVE, 0, 1);

    // The anchor points ride a STILL rectangle — no wind here; only the inner threads move.
    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) pts.push(perim(i, n, rx, ry, rw, rh));

    ctx!.globalCompositeOperation = 'source-over';
    ctx!.strokeStyle = COLOR;
    ctx!.lineCap = 'round';

    // 1) STATIC contour: the inset rectangle itself. Two-pass glow (wide faint + thin bright), NOT
    //    shadowBlur (a CPU gaussian). No wind — it's a calm frame.
    ctx!.beginPath();
    ctx!.rect(rx, ry, rw, rh);
    ctx!.lineWidth = 3;
    ctx!.globalAlpha = clamp(weave * 0.14, 0, 1);
    ctx!.stroke();
    ctx!.lineWidth = 1.1;
    ctx!.globalAlpha = clamp(weave * 0.42, 0, 1);
    ctx!.stroke();

    // 2) ANIMATED inner threads: one per node to a RANDOM-distance neighbour (organic, not a star
    //    polygon), bellies billowed by the wind — the ONLY moving, wind-computed geometry now.
    const gust = still ? 0 : 0.6 + 0.35 * Math.sin(now * 0.0004);
    const belly = compact ? 5 : 8;
    const wind = (x: number, y: number): [number, number] => {
      if (still) return [0, 0];
      const ph = x * 0.024 + y * 0.018;
      const sway = 0.7 * Math.sin(now * 0.0037 + ph) + 0.3 * Math.sin(now * 0.0022 + ph * 1.7);
      const a2 = belly * gust * sway;
      return [a2, a2 * 0.4];
    };
    ctx!.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i]!;
      const q = pts[(i + nodes[i]!.link) % n]!;
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      const w = wind(mx, my);
      // A whisper of inward drape + the wind billow — NOT a hard pull to the centre, which made every
      // thread bend to the middle and cross into a starburst.
      ctx!.moveTo(p[0], p[1]);
      ctx!.quadraticCurveTo(mx + (cx - mx) * 0.05 + w[0], my + (cy - my) * 0.05 + w[1], q[0], q[1]);
    }
    ctx!.lineWidth = 2.6;
    ctx!.globalAlpha = clamp(weave * 0.1, 0, 1);
    ctx!.stroke();
    ctx!.lineWidth = 1;
    ctx!.globalAlpha = clamp(weave * 0.34, 0, 1);
    ctx!.stroke();

    // 3) The orbs on the (still) contour: a soft halo + a crisp core, twinkling in brightness only.
    for (let i = 0; i < n; i++) {
      const nd = nodes[i]!;
      const p = pts[i]!;
      const tw = still ? 0.9 : 0.72 + 0.28 * Math.sin(now * 0.007 + nd.tw);
      const alpha = clamp(weave * tw, 0, 1);
      const col = nd.accent ? ACCENT : COLOR;
      const halo = (compact ? 10 : 14) + (compact ? 7 : 10) * nd.sz;
      ctx!.globalAlpha = alpha * 0.5;
      ctx!.drawImage(glowSprite(col), p[0] - halo / 2, p[1] - halo / 2, halo, halo);
      const core = (compact ? 2.4 : 3) + 2.2 * nd.sz;
      ctx!.globalAlpha = alpha;
      ctx!.drawImage(coreSprite(col), p[0] - core / 2, p[1] - core / 2, core, core);
    }
    ctx!.globalAlpha = 1;
  }

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let holdsSlot = false;
  let visible = true;

  /** A fully-woven, motionless frame — what a web shows when it isn't animating. NEVER nothing. */
  const drawStill = (): void => {
    start = -WEAVE; // skip the weave-in: a still web is shown already woven
    draw(0, true);
  };
  const stopAnim = (): void => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  const releaseSlot = (): void => {
    if (holdsSlot) {
      live--;
      holdsSlot = false;
    }
  };
  const FRAME_MS = 1000 / 30; // ~30fps: the wind is slow, half the redraws look identical
  let last = 0;
  const loop = (now: number): void => {
    raf = requestAnimationFrame(loop);
    if (now - last < FRAME_MS) return;
    last = now;
    draw(now, false);
  };

  /**
   * Decide what this web should be doing right now. Two rules that were both wrong before:
   * - An off-screen web RELEASES its animation slot. It used to just pause while still holding one, so
   *   in a chat that scrolled past MAX_LIVE messages every later web was starved forever.
   * - A web that can't animate still DRAWS a still frame. It used to draw once, synchronously, before
   *   the layer was even in the document (mountCardEffect fills the layer BEFORE appending it), so the
   *   size was 0, the draw bailed out, and nothing ever put a picture there — the effect simply
   *   vanished from those messages.
   */
  const apply = (): void => {
    if (reduce || !visible) {
      stopAnim();
      releaseSlot();
      if (reduce && visible) drawStill();
      return;
    }
    if (!holdsSlot && live < MAX_LIVE) {
      live++;
      holdsSlot = true;
    }
    if (holdsSlot) {
      if (!raf) raf = requestAnimationFrame(loop);
    } else {
      stopAnim();
      drawStill();
    }
  };

  // Re-fit on layer resize AND on DPR change (browser ZOOM, or a monitor with different scaling): zoom
  // changes devicePixelRatio but NOT the layer's CSS-px size, so the ResizeObserver alone stays silent
  // and the backing grid would go stale. Always redraw after re-fitting — resizing a canvas clears it,
  // and a web that isn't animating has nothing to put the picture back.
  const refit = (): void => {
    fit();
    if (!raf) drawStill();
  };
  let mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  const onDpr = (): void => {
    refit();
    mq.removeEventListener('change', onDpr);
    mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener('change', onDpr);
  };
  mq.addEventListener('change', onDpr);
  window.addEventListener('resize', refit);

  // Visibility drives everything (see apply): off-screen frees the slot, on-screen tries to take one.
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[entries.length - 1]!.isIntersecting;
      apply();
    },
    { threshold: 0 },
  );
  io.observe(layer);
  apply();

  return () => {
    releaseSlot();
    stopAnim();
    io.disconnect();
    ro.disconnect();
    mq.removeEventListener('change', onDpr);
    window.removeEventListener('resize', refit);
    cv.remove();
  };
}

export const cardWeb: CardEffectModule = {
  id: 'card-web',
  type: 'card_effect',
  costDust: 5000,
  className: 'card-fx-web',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  labels: { name: 'shop.cardWeb', desc: 'shop.cardWebDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
