/**
 * Host for a canvas card effect whose scene is a PURE FUNCTION OF TIME — `paint(ctx, w, h, t)` with
 * `t` in ms into a fixed loop. Everything a `render` effect otherwise re-implements lives here: the
 * DPR-correct backing store, resize and browser-zoom refits, a random start phase per instance (cards
 * on one page must not tick in unison), an off-screen pause, a reduced-motion still, and a
 * module-wide cap on how many instances may animate at once.
 *
 * The cap is what keeps the OBS-chat worst case bounded: past it an instance draws ONE frame and
 * stops. A time-function scene is exactly the kind that survives that — its still frame is a real
 * frame of the animation, not an empty box.
 *
 * Browser-only, like every `render`: the server imports this catalogue, so nothing here may touch
 * `document` before the function is called. See ./types CardEffectModule.render.
 */

export type ScenePaint = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;

export interface SceneOptions {
  /** Length of one repeat, ms. `t` handed to paint is always in [0, loopMs). */
  loopMs: number;
  /** The frame to show when the scene is not animating (reduced motion, or past the live cap). */
  stillMs: number;
  /** How many instances of THIS effect may animate at once; the rest draw the still frame. */
  maxLive?: number;
}

/** Live counters are per effect, keyed by whatever the caller passes as `id`. */
const liveByEffect = new Map<string, number>();

export function mountScene(
  layer: HTMLElement,
  id: string,
  paint: ScenePaint,
  opts: SceneOptions,
): () => void {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  layer.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  const cap = opts.maxLive ?? 10;
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
    // Self-heal a zero-size measurement: a ResizeObserver can report the layer before the surface's
    // layout has resolved, and without this the layer would stay blank until some later resize.
    if (w <= 0 || h <= 0) fit();
    ctx.clearRect(0, 0, w, h);
    if (w > 0 && h > 0) paint(ctx, w, h, ((t % opts.loopMs) + opts.loopMs) % opts.loopMs);
  };

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phase = Math.random() * opts.loopMs;
  let raf = 0;
  let visible = true;
  let holds = false;

  const release = (): void => {
    if (!holds) return;
    holds = false;
    liveByEffect.set(id, Math.max(0, (liveByEffect.get(id) ?? 1) - 1));
  };
  const frame = (now: number): void => {
    draw(now + phase);
    raf = requestAnimationFrame(frame);
  };
  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const apply = (): void => {
    if (!visible) {
      stop();
      release();
      return;
    }
    if (reduce) {
      stop();
      release();
      draw(opts.stillMs);
      return;
    }
    if (!holds && (liveByEffect.get(id) ?? 0) < cap) {
      liveByEffect.set(id, (liveByEffect.get(id) ?? 0) + 1);
      holds = true;
    }
    if (!holds) {
      stop();
      draw(opts.stillMs);
      return;
    }
    if (!raf) {
      draw(opts.stillMs); // a frame NOW, so nothing waits on rAF to show its first pixel
      raf = requestAnimationFrame(frame);
    }
  };

  // Resizing the backing store CLEARS it, so always put a frame back — guarding this on "not
  // animating" leaves a blank layer whenever rAF is throttled (hidden tab, inactive OBS scene).
  const ro = new ResizeObserver(() => {
    fit();
    draw(opts.stillMs);
  });
  ro.observe(layer);
  // Browser ZOOM changes devicePixelRatio without changing the layer's CSS size, so the
  // ResizeObserver alone stays silent and the backing grid would go stale.
  let mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  const onDpr = (): void => {
    fit();
    draw(opts.stillMs);
    mq.removeEventListener('change', onDpr);
    mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    mq.addEventListener('change', onDpr);
  };
  mq.addEventListener('change', onDpr);
  const io = new IntersectionObserver(
    (entries) => {
      visible = entries[entries.length - 1]!.isIntersecting;
      apply();
    },
    { threshold: 0 },
  );
  io.observe(layer);
  fit();
  apply();

  return () => {
    stop();
    release();
    ro.disconnect();
    io.disconnect();
    mq.removeEventListener('change', onDpr);
    canvas.remove();
  };
}

/** #rrggbb → [r, g, b]. */
export function sceneRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** #rrggbb + alpha → css rgba(). */
export function sceneRgba(hex: string, a: number): string {
  const [r, g, b] = sceneRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** Mix a colour toward white — how a colourable effect derives its highlight from the chosen hue. */
export function sceneLighten(hex: string, t: number): string {
  const [r, g, b] = sceneRgb(hex);
  const c = (v: number) => Math.round(v + (255 - v) * t);
  return `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
/** Deterministic per-index pseudo-random in [0,1) — a scene must look the same every repeat. */
export function sceneHash(i: number, salt = 1): number {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
