import type { EntranceModule } from '../types';

/**
 * A Doctor-Strange-style portal opens and the WHOLE message drives out through it. Nothing inside the
 * message is animated separately (that was the lesson from the earlier particle experiments — a text
 * that assembled while its pill and nickname just popped in read as a hack). The block moves as one:
 * a `translateX` slide plus a `clip-path` that hides whatever is still "on the other side" of the
 * portal plane. A spinning ring of sparks marks the doorway, and a vortex of sparks swirling into its
 * centre gives it depth — a wormhole the message emerges FROM, not a flat plane it pushes off.
 *
 * WHY JS + a canvas BEHIND the block:
 * - It's a real particle ring (a spinning, flickering, ember-spraying sleeve) — math per frame.
 * - The message must come OUT of the portal, so the FULL ellipse — dark "mouth" and spark ring — is
 *   drawn on a canvas layered behind the block (z-index below it). The block, in front, covers the
 *   ring's far half exactly as an object passing through a doorway would, so the whole ellipse reads
 *   as one ring the message emerges from — not a half-ring floating beside it. (An earlier version
 *   kept the canvas on top and only painted the near side to avoid covering the block; that produced a
 *   visible half-portal, which is the bug this replaces.) The OBS overlays are transparent, so a
 *   behind layer composites cleanly over the stream.
 * - Coordinates are taken RELATIVE TO THE CANVAS's own box, and the canvas is sized to that box, so it
 *   works whether the canvas fills the viewport (the overlays) or a smaller mounted region.
 *
 * Recovering the block's true position while we transform it: getBoundingClientRect() includes our own
 * translateX, so natural-left = rect.left − (the tx we last applied). That keeps the portal glued to
 * the block even when the chat reflows and the row rises mid-flight (we only ever translate X, so top
 * needs no correction).
 *
 * Reduced motion is honoured in applyEntrance (no data-fx, no play) and again here for direct callers
 * like the shop preview — a viewer's cosmetic must never override someone's accessibility setting.
 */

const DUR = 1700; // ms — the whole open → drive-out → close
const SPIN = 0.0016; // rad/ms ring rotation
// Brand mint default. NOT --color-accent (a cosmetic belongs to the viewer and must look identical on
// every surface); overridden per viewer by the 'entrance-portal-color' upgrade.
const DEFAULT_COLOR = '#8df0cc';

interface Spark {
  a: number; // base angle on the ellipse
  rj: number; // per-spark radius jitter (fuzzy ring, not a clean line)
  fl: number; // flicker phase
  fs: number; // flicker frequency
  es: number; // ember speed
  ep: number; // ember phase
}
interface VParticle {
  a0: number; // this particle's angle on its spiral arm
  ph0: number; // phase offset along the inward journey (0 = rim, 1 = centre)
  speed: number; // how fast it travels inward (per ms)
}
interface Shard {
  y0: number; // vertical origin across the mouth, in ry units (−1 top … 1 bottom)
  x0: number; // horizontal origin, in ry units — born in/near the visible left of the mouth
  vx: number; // RIGHTWARD speed (ry units/life): the message drags shards in its direction of travel
  vy: number; // vertical drift, fanning off the travel axis
  ph: number; // launch point along the run (global g) — front-loaded to the emergence
  sz: number; // base size
}
interface Portal {
  el: HTMLElement;
  color: string; // #rrggbb tint for the sparks (default mint, or the equipped upgrade colour)
  sprite: HTMLCanvasElement | null; // the glow sprite for `color`, built on the first laid-out frame
  sparks: Spark[] | null; // ring, built on the first laid-out frame when the block height is known
  vortex: VParticle[] | null; // interior swirl, built alongside the ring
  burst: Shard[] | null; // punch-through shards torn from the centre as the block drives out
  lastTx: number; // the translateX currently applied — used to recover the block's natural position
  start: number | null;
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
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
// Ring opens (with a hair of overshoot), holds, then snaps shut once the block is out.
function ringScale(g: number): number {
  if (g < 0.2) {
    // Elastic overshoot that settles to EXACTLY 1 (easeOutBack ends at 1.0 with zero velocity), so the
    // opening flows seamlessly into the steady phase. The old `easeOut(t) * 1.06` peaked at 1.06 and
    // then the next segment was a flat 1.0 — a −0.06 jump that read as a tiny jerk once the portal was
    // up, the "slight sudden shrink at the peak".
    const t = g / 0.2;
    const c1 = 1.70158;
    return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  // Ease the close shut (accelerating) instead of a linear snap.
  if (g > 0.82) {
    const tc = (g - 0.82) / 0.18;
    return clamp(1 - tc * tc * tc, 0, 1);
  }
  return 1;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let dpr = 1;
let resizeBound = false;
const active: Portal[] = [];
const spriteCache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A glow sprite tinted to `color`: white-hot core → a light tint of the colour → the colour, fading
 *  out. Cached, since a viewer keeps one colour and every spark reuses the same sprite. */
function spriteFor(color: string): HTMLCanvasElement {
  const cached = spriteCache.get(color);
  if (cached) return cached;
  const [r, g, b] = hexToRgb(color);
  // 60% toward white — the bright inner halo that keeps sparks reading as light, not flat colour.
  const lr = Math.round(r + (255 - r) * 0.6);
  const lg = Math.round(g + (255 - g) * 0.6);
  const lb = Math.round(b + (255 - b) * 0.6);
  const s = document.createElement('canvas');
  s.width = s.height = 32;
  const c = s.getContext('2d')!;
  const grad = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, `rgba(${lr},${lg},${lb},0.95)`);
  grad.addColorStop(0.75, `rgba(${r},${g},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, 32, 32);
  spriteCache.set(color, s);
  return s;
}
function resize(): void {
  if (!canvas || !ctx) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Size to the canvas's own box (viewport-sized on the overlays), and draw in canvas-relative coords.
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
  // On the transparent overlays the layer sits BEHIND everything (`-1`), so the block covers the
  // ring's far half over the stream. Mounted inside an opaque surface (the shop drawer panel, which is
  // a transform'd containing block, so this `fixed` canvas fills IT) it sits at that surface's base
  // (`0`) with the demo block lifted above it — same "behind the block" result on an opaque bg.
  st.zIndex = mount === document.body ? '-1' : '0';
  mount.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resize();
  if (!resizeBound) {
    window.addEventListener('resize', resize);
    resizeBound = true;
  }
}

function buildSparks(h: number): Spark[] {
  const ry0 = h * 0.62 + 16;
  const n = clamp(Math.round(ry0 * 1.9), 64, 240); // count ∝ ring circumference → scales with the block
  const out: Spark[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      a: (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.12,
      rj: 0.82 + Math.random() * 0.32,
      fl: Math.random() * 6.28,
      fs: 0.004 + Math.random() * 0.006,
      es: 0.4 + Math.random() * 0.9,
      ep: Math.random(),
    });
  }
  return out;
}

function buildVortex(h: number): VParticle[] {
  const ry0 = h * 0.62 + 16;
  const n = clamp(Math.round(ry0 * 1.3), 55, 200); // fills the disc; scales with the block like the ring
  const out: VParticle[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      a0: Math.random() * Math.PI * 2,
      ph0: Math.random(), // staggered so particles sit at every depth of the spiral at once
      speed: 0.00028 + Math.random() * 0.00024,
    });
  }
  return out;
}

function buildBurst(h: number): Shard[] {
  const ry0 = h * 0.62 + 16;
  const n = clamp(Math.round(ry0 * 15.8), 28, 130); // scales with the mouth, like the ring/vortex
  const out: Shard[] = [];
  for (let i = 0; i < n; i++) {
    const y0 = (Math.random() * 2 - 1) * 0.95; // torn from anywhere up the height of the mouth
    out.push({
      y0,
      x0: -0.35 + Math.random() * 0.45, // born in/near the visible left of the mouth
      vx: 1.3 + Math.random() * 2.4, // dragged rightward, following the message out
      vy: y0 * 0.15 + (Math.random() - 0.5) * 0.5, // fan away from the travel axis + jitter
      ph: 0.14 + Math.random() * 0.42, // launch during the drive-out, front-loaded to the punch-through
      sz: 1 + Math.random() * 1.6,
    });
  }
  return out;
}

function drop(sw: Portal, index: number): void {
  clearTimeout(sw.safety);
  reset(sw.el);
  active.splice(index, 1);
}
function remove(sw: Portal): void {
  const i = active.indexOf(sw);
  if (i >= 0) drop(sw, i);
}

function frame(now: number): void {
  raf = 0;
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cRect = canvas.getBoundingClientRect();
  for (let s = active.length - 1; s >= 0; s--) {
    const sw = active[s]!;
    if (!sw.el.isConnected) {
      drop(sw, s);
      continue;
    }
    const rect = sw.el.getBoundingClientRect();
    if (rect.width < 1) continue; // not laid out yet — the block is already clipped hidden; wait
    // rect reflects the tx we last applied, so the true left is rect.left − lastTx (tracks reflow).
    const natLeft = rect.left - sw.lastTx;
    const w = rect.width;
    const h = rect.height;
    if (sw.start === null) {
      sw.start = now;
      sw.sparks = buildSparks(h);
      sw.vortex = buildVortex(h);
      sw.burst = buildBurst(h);
      sw.sprite = spriteFor(sw.color);
    }
    const g = clamp((now - sw.start) / DUR, 0, 1);

    // WHOLE block slides out through the portal plane; the clip hides what's still on the other side.
    const slide = easeOut(clamp((g - 0.12) / 0.66, 0, 1));
    const tx = -w * (1 - slide);
    sw.el.style.transform = `translateX(${tx}px)`;
    setClip(sw.el, `inset(0 0 0 ${Math.max(0, -tx)}px)`);
    sw.lastTx = tx;

    // Portal geometry, in canvas-relative coords. The plane sits at the block's final left edge; the
    // block, in front, covers the ring's far (right) half — so we draw the WHOLE ellipse, no skipping.
    const Px = natLeft - cRect.left;
    const cy = rect.top - cRect.top + h / 2;
    const sc = ringScale(g);
    const ry = (h * 0.62 + 16) * sc;
    const rx = ry * 0.36;

    // 1) A subtle dark core (source-over) so the interior reads as a receding hole, not a flat disc.
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(Px, cy);
    ctx.scale(rx, ry);
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    core.addColorStop(0, 'rgba(2,6,12,0.6)');
    core.addColorStop(0.65, 'rgba(2,6,12,0.38)');
    core.addColorStop(1, 'rgba(2,6,12,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.globalCompositeOperation = 'lighter';
    // 2) The INTERIOR VORTEX — sparks spiral inward toward the centre (a wormhole), fading in at the
    //    rim and out into the depth. TWO separate motions keep it a smooth spiral instead of jitter: a
    //    UNIFORM global rotation (linear in time → constant angular speed) and a per-particle inward
    //    WINDING driven by the particle's own phase. The previous version multiplied `now` by a
    //    radius-dependent factor, so as the radius changed the angle lurched — that read as chaotic
    //    fast spinning. This is what gives the portal its depth.
    const WIND = 2.6; // spiral turns per inward journey
    for (const v of sw.vortex!) {
      const ph = (((v.ph0 + now * v.speed) % 1) + 1) % 1; // 0 at the rim → 1 at the centre
      const r = 1 - ph;
      const ang = v.a0 + now * 0.0009 + WIND * ph * Math.PI * 2;
      const x = Px + Math.cos(ang) * rx * r;
      const y = cy + Math.sin(ang) * ry * r;
      // Fade in as it enters at the rim and out as it reaches the centre, so the phase wrap is unseen.
      const fade = clamp(ph / 0.12, 0, 1) * clamp((1 - ph) / 0.32, 0, 1);
      const size = (0.9 + 2.4 * r) * sc; // big near the rim, tiny deep in — the depth cue
      ctx.globalAlpha = clamp((0.2 + 0.7 * r) * fade * sc, 0, 1);
      ctx.drawImage(sw.sprite!, x - size / 2, y - size / 2, size, size);
    }
    // 3) The full spinning ring of sparks + outward embers. The far half is behind the block and
    //    simply covered by it, which is what keeps the ellipse whole.
    for (const p of sw.sparks!) {
      const ang = p.a + now * SPIN;
      const bx = Px + Math.cos(ang) * rx * p.rj;
      const by = cy + Math.sin(ang) * ry * p.rj;
      const fl = 0.55 + 0.45 * Math.sin(now * p.fs + p.fl);
      const size = (2.8 + 3.0 * fl) * sc; // bolder sparks so the ring reads over any stream, not just a dark one
      ctx.globalAlpha = clamp((0.5 + 0.5 * fl) * sc, 0, 1);
      ctx.drawImage(sw.sprite!, bx - size / 2, by - size / 2, size, size);
      const ee = (now * 0.0006 * p.es + p.ep) % 1;
      const er = ee * 40 * sc;
      const ex = bx + Math.cos(ang) * er;
      const ey = by + Math.sin(ang) * er;
      const es = (2.2 * (1 - ee) + 0.8) * sc;
      ctx.globalAlpha = clamp((1 - ee) * 0.7 * sc, 0, 1);
      ctx.drawImage(sw.sprite!, ex - es / 2, ey - es / 2, es, es);
    }
    // 4) SHEAR WAKE — the message grazes the portal on its way out and drags shards off the inner
    //    membrane, streaming them LEFT→RIGHT in its own direction of travel (not a radial burst).
    //    Shards torn from the top/bottom stream out past the block and read as a wake; those directly
    //    behind the emerging block are simply covered by it. Brightest at emergence, gone by the close.
    const SHARD_LIFE = 0.34; // fraction of the run each shard is alive
    for (const b of sw.burst!) {
      const life = (g - b.ph) / SHARD_LIFE;
      if (life <= 0 || life >= 1) continue;
      const ea = easeOut(life); // fast launch, easing to a stop
      const x = Px + (b.x0 + b.vx * ea) * ry; // stream rightward, following the message
      const y = cy + (b.y0 + b.vy * ea) * ry; // fanning off the travel axis
      const size = (1 + 2.5 * (1 - life)) * b.sz * sc; // a bright shard at birth, shrinking as it flies
      ctx.globalAlpha = clamp(Math.min(1, life / 0.12) * (1 - life) * 0.85 * sc, 0, 1);
      ctx.drawImage(sw.sprite!, x - size / 2, y - size / 2, size, size);
    }

    if (g >= 1) drop(sw, s);
  }
  ctx.globalAlpha = 1;
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
  // Hide the whole block until the first laid-out frame drives it out (no width known yet, so a 100%
  // inset rather than a px one). No flash: applyEntrance runs before the element is painted.
  el.style.transform = '';
  setClip(el, 'inset(0 0 0 100%)');
  const sw: Portal = {
    el,
    // Only a full #rrggbb is honoured; anything else (absent, malformed) falls back to the brand mint.
    color: color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_COLOR,
    sprite: null,
    sparks: null,
    vortex: null,
    burst: null,
    lastTx: 0,
    start: null,
    // If the element never lays out (removed mid-flight, a throttled background tab), don't leave the
    // message clipped away forever.
    safety: setTimeout(() => remove(sw), DUR + 1500),
  };
  active.push(sw);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => remove(sw);
}

export const entrancePortal: EntranceModule = {
  id: 'entrance-portal',
  type: 'entrance',
  // Top shelf, level with glitch: it plays on every message but is a ~1.7s flash, so it earns the top
  // price by showing up constantly, not by out-earning a card effect that runs forever.
  costDust: 4000,
  fx: 'portal',
  labels: { name: 'shop.entrancePortal', desc: 'shop.entrancePortalDesc' },
  play,
  // No `css`: the whole effect is JS (transform + clip on the block, canvas for the ring). data-fx
  // only needs to EXIST so the surface's own default entrance (:not([data-fx])) stands down.
};
