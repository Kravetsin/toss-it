/**
 * Tiny canvas harness for the "games/movies" CONCEPT bench. Each concept is a pure function of time
 * — `paint(ctx, w, h, t)` where `t` is ms into a fixed loop — exactly the shape card-blade-duel
 * settled on, so a concept that gets picked lifts into `packages/shared/src/cosmetics/effects/` as a
 * `CardEffectModule.render` with the scene body unchanged.
 *
 * Deliberately NOT in the cosmetics registry: a registered item is a shop item, and none of these is
 * priced or approved yet. Delete this folder (and its Section in GalleryPage) once the survivors move.
 *
 * What the harness owns (so no concept re-implements it): DPR-correct backing store, resize, a random
 * start phase per instance (cards on one page must not tick in unison), an IntersectionObserver pause
 * off-screen, and a reduced-motion still frame.
 */

export type Paint = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

export interface Concept {
  id: string;
  /** Which franchise it nods at — bench label only, never shipped as copy. */
  nod: string;
  title: string;
  blurb: string;
  loopMs: number;
  /** Frozen frame for reduced motion: the one instant that is legible as a still. */
  stillMs: number;
  paint: Paint;
}

export const TAU = Math.PI * 2;

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
/** 0..1 progress of `t` through a window, clamped — the only time math most scenes need. */
export function span(t: number, from: number, to: number): number {
  return clamp((t - from) / (to - from), 0, 1);
}
export const easeIn = (t: number): number => t * t * t;
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;
export const easeInOut = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** Deterministic per-index pseudo-random in [0,1) — a scene must look the same every repeat. */
export function hash(i: number, salt = 1): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const spriteCache = new Map<string, HTMLCanvasElement>();
/** Soft radial halo sprite (cached per colour) — cheaper than a shadowBlur per draw. */
export function glow(color: string): HTMLCanvasElement {
  const hit = spriteCache.get(color);
  if (hit) return hit;
  const s = document.createElement('canvas');
  s.width = s.height = 48;
  const c = s.getContext('2d')!;
  const g = c.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, rgba(color, 0.85));
  g.addColorStop(0.3, rgba(color, 0.35));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillRect(0, 0, 48, 48);
  spriteCache.set(color, s);
  return s;
}

export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** Draw a soft blob of `color` at r radius — the workhorse for sparks, motes and bloom. */
export function blob(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  r: number,
  a = 1,
): void {
  if (r <= 0 || a <= 0) return;
  ctx.globalAlpha = a;
  ctx.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

/**
 * Mount a concept in a layer. Same signature as CardEffectModule.render minus the surface argument,
 * which no concept needs yet (density is read off the real box instead — see the blade-duel notes on
 * `compact` meaning SHORT, not small).
 */
export function mountScene(layer: HTMLElement, concept: Concept): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  layer.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  let w = 0;
  let h = 0;

  const fit = (): void => {
    const dpr = window.devicePixelRatio || 1;
    w = layer.clientWidth;
    h = layer.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = (t: number): void => {
    // Self-heal a zero-size measurement: a ResizeObserver can report the layer before the grid has
    // resolved, and without this the layer stays blank forever if no later resize happens to fire.
    if (w <= 0 || h <= 0) fit();
    ctx.clearRect(0, 0, w, h);
    if (w > 0 && h > 0) concept.paint(ctx, w, h, t % concept.loopMs);
  };

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phase = Math.random() * concept.loopMs;
  let raf = 0;
  let visible = true;

  const frame = (now: number): void => {
    draw(now + phase);
    raf = requestAnimationFrame(frame);
  };
  const apply = (): void => {
    if (reduce || !visible) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (visible) draw(concept.stillMs);
      return;
    }
    if (!raf) {
      draw(concept.stillMs); // a frame NOW, so nothing waits on rAF to show its first pixel
      raf = requestAnimationFrame(frame);
    }
  };

  // Resizing the backing store CLEARS it, so always put a frame back — guarding this on "not
  // animating" leaves a blank layer whenever rAF is throttled (hidden tab, inactive OBS scene).
  const ro = new ResizeObserver(() => {
    fit();
    draw(concept.stillMs);
  });
  ro.observe(layer);
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[entries.length - 1]!.isIntersecting;
      apply();
    },
    { threshold: 0 },
  );
  io.observe(layer);
  fit();
  // Paint once up front: on a hidden page (a background tab, an inactive OBS scene) rAF never fires,
  // and without this the layer would sit empty until the page is looked at.
  draw(concept.stillMs);
  apply();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    canvas.remove();
  };
}
