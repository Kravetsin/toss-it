import type { CardEffectModule } from '../types';

/**
 * A web of light wraps the card and sways on the wind — the same web as the entrance-astral arrival,
 * lifted onto a card as a PERSISTENT decoration. Will-o'-wisp orbs (a white-hot core in a soft mint
 * glow, the card-wisp look) sit on anchor points ringing the card; threads of light weave between them
 * — an edge ring plus longer chords crossing the card — and the whole web billows in a gentle wind that
 * breathes slowly, forever.
 *
 * WHY THIS IS A `render` EFFECT, NOT A PARTICLE SWARM. Every other card effect is independent CSS `.p`
 * particles; this one is a CONNECTED structure whose threads billow between SHARED nodes, which CSS
 * particles can't express (a `.p` knows nothing of any other `.p`'s position). So it ships a JS canvas
 * renderer instead (see CardEffectModule.render): fillCardEffect hands it the `.card-fx` layer — inset:0
 * on the card, clipped to the card's rounded shape — and it hosts its own canvas there, one per card,
 * with its own rAF loop and teardown. The web rides the LAYER's own box, so it fits any card size for
 * free (a chat pill gets a tiny web, a feed card a big one); the anchors sit just INSIDE the edge so the
 * layer's overflow clip doesn't eat them.
 *
 * HOW AN ORB IS DRAWN. Two sprites stacked, like card-wisp's dot + box-shadow: a soft mint HALO and, on
 * top, a small CRISP core disc with a defined edge. One gradient alone read as a blurry smudge.
 *
 * The threads sit under the orbs; the wind nudges the anchors only a little (they're pinned) but bows
 * the thread bellies more, so the web moves like silk in a draught. It weaves in once on mount, then
 * holds and sways — no fade-out, it's a standing decoration. Reduced motion draws a single still frame.
 */

const COLOR = '#8df0cc'; // brand mint — NOT --color-accent (a cosmetic must look identical everywhere)
const ACCENT = '#cffff2'; // a paler mint, sprinkled through for a subtle two-tone glow
const WEAVE = 1300; // ms to weave the web in on mount
const TAU = Math.PI * 2;

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
}

function render(layer: HTMLElement, _surface: string, compact: boolean): (() => void) | void {
  if (typeof window === 'undefined') return;
  const cv = document.createElement('canvas');
  const st = cv.style;
  st.position = 'absolute';
  st.inset = '0';
  st.width = '100%';
  st.height = '100%';
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
  function fit(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = layer.getBoundingClientRect();
    W = r.width;
    H = r.height;
    cv.width = Math.max(1, Math.floor(W * dpr));
    cv.height = Math.max(1, Math.floor(H * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(layer);

  let nodes: Node[] | null = null;
  let start: number | null = null;

  function draw(now: number, still: boolean): void {
    ctx!.clearRect(0, 0, cv.width, cv.height);
    if (W < 8 || H < 8) return;
    if (start === null) start = now;

    // Anchors sit just INSIDE the card edge so the layer's overflow clip never eats them.
    const M = compact ? 3 : 6;
    const rx = M;
    const ry = M;
    const rw = W - 2 * M;
    const rh = H - 2 * M;
    if (rw < 8 || rh < 8) return;
    if (!nodes) {
      const n = clamp(Math.round((2 * (rw + rh)) / (compact ? 46 : 54)), compact ? 6 : 8, 26);
      nodes = Array.from({ length: n }, () => ({
        sz: Math.random(),
        tw: Math.random() * TAU,
        accent: Math.random() < 0.24,
      }));
    }
    const n = nodes.length;
    const cx = rx + rw / 2;
    const cy = ry + rh / 2;

    // Weave-in on mount, then a steady standing web.
    const weave = clamp((now - start) / WEAVE, 0, 1);

    // Wind: anchors barely tremble, thread bellies billow more; a slow breath varies the gust so it
    // never loops mechanically. `still` (reduced motion) freezes it.
    const gust = still ? 0 : 0.75 + 0.35 * Math.sin(now * 0.0004);
    const wind = (x: number, y: number, amp: number): [number, number] => {
      if (still) return [0, 0];
      const ph = x * 0.023 + y * 0.017;
      const sway = 0.7 * Math.sin(now * 0.0037 + ph) + 0.3 * Math.sin(now * 0.0022 + ph * 1.7);
      const a2 = amp * gust * sway;
      return [a2, a2 * 0.18];
    };

    const pts: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const p = perim(i, n, rx, ry, rw, rh);
      const w = wind(p[0], p[1], 2);
      pts.push([p[0] + w[0], p[1] + w[1]]);
    }

    const bellyAmp = compact ? 4 : 7;
    const strand = (i: number, j: number, bow: number): void => {
      const p = pts[i]!;
      const q = pts[j]!;
      const mx = (p[0] + q[0]) / 2;
      const my = (p[1] + q[1]) / 2;
      const w = wind(mx, my, bellyAmp);
      ctx!.moveTo(p[0], p[1]);
      ctx!.quadraticCurveTo(mx + (mx - cx) * bow + w[0], my + (my - cy) * bow + w[1], q[0], q[1]);
    };

    ctx!.globalCompositeOperation = 'source-over';
    ctx!.strokeStyle = COLOR;
    ctx!.lineWidth = 1.1;
    ctx!.shadowColor = COLOR;
    ctx!.shadowBlur = 6;
    // Border web: the ring hugging the edge + outward arcs.
    ctx!.globalAlpha = clamp(weave * 0.5, 0, 1);
    ctx!.beginPath();
    for (let i = 0; i < n; i++) {
      strand(i, (i + 1) % n, 0.05);
      strand(i, (i + 2) % n, 0.16);
    }
    ctx!.stroke();
    // Inner net: longer chords crossing the card, a touch fainter so it reads as depth, not clutter.
    const inner = clamp(Math.round(n * 0.34), 3, n - 2);
    ctx!.globalAlpha = clamp(weave * 0.36, 0, 1);
    ctx!.beginPath();
    for (let i = 0; i < n; i++) strand(i, (i + inner) % n, -0.05);
    ctx!.stroke();
    ctx!.shadowBlur = 0;

    // The orbs, at the (winded) anchors: a soft halo with a crisp core on top.
    for (let i = 0; i < n; i++) {
      const nd = nodes[i]!;
      const p = pts[i]!;
      const tw = 0.72 + 0.28 * Math.sin(now * 0.007 + nd.tw);
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
  if (reduce) {
    // One still frame — a fully woven, motionless web.
    start = -WEAVE;
    draw(0, true);
  } else {
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      draw(now, false);
    };
    raf = requestAnimationFrame(loop);
  }

  return () => {
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
    cv.remove();
  };
}

export const cardWeb: CardEffectModule = {
  id: 'card-web',
  type: 'card_effect',
  costDust: 4000,
  className: 'card-fx-web',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to be
  // created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  labels: { name: 'shop.cardWeb', desc: 'shop.cardWebDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
