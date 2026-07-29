import type { EntranceModule } from '../types';

/**
 * The message SURFACES. A line of water sits just below where the block will come to rest; the block
 * rises through it from underneath, everything still below the line hidden, until it is entirely out.
 * Then the water it broke keeps working for another beat — the line settles, rings spread from where
 * it came through, and what it carried up runs off its bottom edge and falls back in.
 *
 * THE SURFACE SITS BELOW THE BLOCK'S RESTING PLACE, and that is the whole correctness of this effect.
 * Put the line across the middle of the block (the first version did) and the block can never fully
 * emerge — its own layout position leaves half of it under water forever, so the clip has to be
 * dropped on a timer, and the lower half of the message appears in one frame. That pop is not a
 * polish issue, it is the geometry being wrong. With the line below the rest position, the clip
 * reaches zero on its own while the block is still moving, and nothing is ever revealed abruptly.
 *
 * WHY JS + A CANVAS IN FRONT:
 * - The clip has to track the block's REAL bottom edge against a fixed waterline every frame — a
 *   keyframe cannot know where the block will be laid out.
 * - Water is in FRONT of what comes out of it: the foam and the near side of each ring have to cross
 *   the block's lower edge, or it reads as sliding over a painting rather than passing through water.
 *
 * NO DRAWN WATERLINE, AND THAT IS THE POINT. Two lines were tried and both are gone. A white meniscus
 * along the block's clipped edge read as a hard highlight the message was riding out on — and it drew
 * the eye to the one place the message is still incomplete. A tinted sine wave across the span lasted
 * longer, but once the foam got dense enough to read as real spray, the single smooth stroke next to
 * it was obviously a SYMBOL for water sitting in a picture of water. What is left is only what water
 * actually looks like from above: rings that say where the surface is, and foam that says what it is
 * made of. Nothing draws the surface itself.
 *
 * The block is READABLE EARLY on purpose: it clears the water in the first half of the run, and the
 * rest is the surface calming down. An entrance may borrow a moment of legibility, not spend the
 * whole message on it — the chat overlay exists to be read, on someone else's stream.
 *
 * The wave is drawn over a bounded span around the block, with its amplitude dying at both ends,
 * rather than across the whole layer: a full-width line is wrong on a stage (a waterline through the
 * entire screen for one chat pill) and, in the shop, would run through every other card.
 *
 * Reduced motion is honoured in applyEntrance (no data-fx, no play) and again here for direct callers
 * like the shop preview.
 */

const DUR = 1550; // ms — surfaces, then the water settles
const RISE_IN = 80; // ms before the block starts to move
const RISE_MS = 860; // ms of rising
const RING_MS = 1000; // how long a ring travels before it is spent
const GAP = 6; // px the waterline sits below the block's resting place
const RISE_OF = 1.7; // how far below its place the block starts, in block heights

/**
 * The window during which the block is actually IN the water, as ms from the start of the run: from
 * its top edge breaking the surface to its bottom edge leaving it. Everything the water does — rings,
 * foam — is born inside this window and nowhere else.
 *
 * SOLVED, not guessed, and it has to be: the rise is eased, so the block covers most of the distance
 * early and leaves the water FAR sooner than the rise ends. At a 40px block that is 55% of the rise,
 * not 95% — a constant picked by eye put the last ring a tenth of a second after the message was
 * already clear, which reads as the water reacting to nothing. Inverting easeOut (`1 − ∛(1 − e)`)
 * gives the exact moment for any block height, so a tall alert and a one-line pill both stop
 * disturbing the surface when they genuinely stop touching it.
 */
function crossingWindow(bh: number): [number, number] {
  const rise = bh * RISE_OF;
  const at = (ty: number) => RISE_IN + RISE_MS * (1 - Math.cbrt(clamp(ty / rise, 0, 1)));
  return [at(bh + GAP), at(GAP)]; // top edge pierces → bottom edge clears
}
const DEFAULT_COLOR = '#8df0cc';
const TAU = Math.PI * 2;

interface Drop {
  u: number; // where along the block's width it is thrown from, 0..1
  vx: number; // outward speed, px/s — biased away from the centre
  vy: number; // upward speed, px/s
  ph: number; // ms it is thrown, clustered around the crossing
  sz: number; // base size
  /** Froth (the many small slow specks churning at the line) rather than a thrown droplet. */
  froth: boolean;
}
interface Tide {
  el: HTMLElement;
  /** Surface the run may not draw outside of, or null on the body-level layer. See entrance-strike. */
  clipTo: HTMLElement | null;
  color: string;
  sprite: HTMLCanvasElement | null; // the coloured glow
  core: HTMLCanvasElement | null; // the white-hot centre stacked on it
  spray: Drop[] | null;
  /** The crossing window in ms (see crossingWindow), resolved once the block's height is known. */
  pierceMs: number;
  clearMs: number;
  /** The translateY currently applied — used to recover the block's natural position (see the frame
   *  loop). Never the value we are about to apply: on the first frame nothing is applied yet. */
  lastTy: number;
  start: number | null;
  safety: ReturnType<typeof setTimeout>;
}

function setClip(el: HTMLElement, v: string): void {
  el.style.clipPath = v;
  (el.style as unknown as Record<string, string>).webkitClipPath = v;
}
function reset(el: HTMLElement): void {
  el.style.opacity = '';
  el.style.transform = '';
  el.style.clipPath = '';
  (el.style as unknown as Record<string, string>).webkitClipPath = '';
}
function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let raf = 0;
let dpr = 1;
let resizeBound = false;
const active: Tide[] = [];
const spriteCache = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

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
/** The white-hot centre, stacked on the glow — see entrance-strike, where the pair is documented. */
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
  grad.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.72, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
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
  // IN FRONT of the message (see the header): water is in front of what surfaces through it.
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
 * Water thrown up along the block as it breaks through, which then falls back into the line. NOT drips
 * hanging off the bottom edge: the surface sits a few px under that edge, so a drip would have nothing
 * to fall through and would blink out in one frame. Spray is thrown UP from the waterline, so it has
 * real travel — and it happens at the crossing, which is the moment the water is actually disturbed.
 *
 * TWO POPULATIONS, because sea foam is not a handful of droplets. Most of it is FROTH: small, slow,
 * barely clearing the line, churning along the whole width for as long as the water is disturbed. The
 * rest are thrown droplets that actually arc. Assigned BY INDEX rather than rolled per particle — the
 * catalog already learned that lesson on card-sakura's depth planes: independent draws let one bucket
 * take over a small swarm, and a run with no froth is exactly the sparse look this replaces.
 */
function buildSpray(w: number, pierceMs: number, clearMs: number): Drop[] {
  const n = clamp(Math.round(w * 0.42), 46, 130); // dense enough to read as foam, not as debris
  const out: Drop[] = [];
  for (let i = 0; i < n; i++) {
    const froth = i % 3 !== 0; // two of every three
    // Spawns a little past both edges: foam spreads off the sides of what came through, it does not
    // stop at the block's corners.
    const u = -0.05 + Math.random() * 1.1;
    const dir = u < 0.5 ? -1 : 1;
    out.push({
      u,
      froth,
      vx: dir * (froth ? 4 + Math.random() * 26 : 20 + Math.random() * 75),
      // Froth barely leaves the water (apex a few px); a droplet arcs tens of px up.
      vy: froth ? 55 + Math.random() * 85 : 150 + Math.random() * 150,
      // Nothing is thrown before the block breaks the surface or after it has left it — water only
      // reacts while it is actually being disturbed. The froth churns across that whole window; the
      // droplets are thrown around the pierce itself.
      ph: pierceMs + Math.random() * (clearMs - pierceMs) * (froth ? 1 : 0.55),
      // Squared, so the size distribution is mostly specks with a few fat drops — an even spread of
      // sizes reads as gravel.
      sz: froth ? 0.45 + Math.random() ** 2 * 0.9 : 1 + Math.random() ** 2 * 2.2,
    });
  }
  return out;
}

function drop(t: Tide, index: number): void {
  clearTimeout(t.safety);
  reset(t.el);
  active.splice(index, 1);
}
function remove(t: Tide): void {
  const i = active.indexOf(t);
  if (i >= 0) drop(t, i);
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
    const t = active[i]!;
    if (!t.el.isConnected) {
      drop(t, i);
      continue;
    }
    const rect = t.el.getBoundingClientRect();
    if (rect.width < 1) continue; // not laid out yet — the block is held under water; wait
    if (t.start === null) {
      t.start = now;
      [t.pierceMs, t.clearMs] = crossingWindow(rect.height);
      t.spray = buildSpray(rect.width, t.pierceMs, t.clearMs);
      t.sprite = spriteFor(t.color);
      t.core = coreSpriteFor(t.color);
    }
    const ms = now - t.start;
    // Drop BEFORE drawing at the end, so the frame that ends the run leaves nothing on the canvas.
    if (ms >= DUR) {
      drop(t, i);
      continue;
    }

    const bx = rect.left - cRect.left;
    const bw = rect.width;
    const bh = rect.height;
    // getBoundingClientRect() reflects the translateY ALREADY applied, so the natural top is
    // rect.top − lastTy. Subtracting the ty we are about to apply would be wrong by a whole frame —
    // on the first one nothing is applied yet — and the waterline would be drawn a rise away from the
    // block. This also tracks a chat reflow, exactly as entrance-portal does for its X.
    const by = rect.top - cRect.top - t.lastTy;
    const rise = bh * RISE_OF;
    const up = easeOut(clamp((ms - RISE_IN) / RISE_MS, 0, 1));
    const ty = rise * (1 - up);
    // The waterline: just under where the block comes to rest, so the block clears it completely (see
    // the header). Never drawn — it is where the rings are centred and where the foam is thrown from.
    // 6px, not 0: at exactly 0 the foam churns on the block's own border and reads as stuck to it.
    const surfY = by + bh + GAP;

    t.el.style.transform = `translateY(${ty.toFixed(1)}px)`;
    t.lastTy = ty;
    // Hide whatever is still under water. Reaches 0 on its own before the rise ends — no timed
    // removal, which is what used to make the bottom of the message appear in a single frame.
    const cut = clamp(by + bh + ty - surfY, 0, bh);
    setClip(t.el, cut > 0.5 ? `inset(0 0 ${Math.ceil(cut)}px 0)` : 'none');

    const cx = bx + bw / 2;
    const span = bw * 0.6 + 90; // how far the disturbance reaches to either side
    // How disturbed the water is overall: everything drawn fades with this rather than each particle
    // outliving the moment that threw it.
    const waterA = clamp(ms / 90, 0, 1) * clamp((DUR - ms) / 420, 0, 1);

    ctx.save();
    if (t.clipTo) {
      const padX = Math.max(24, bh);
      const padY = Math.max(20, bh * 0.6);
      ctx.beginPath();
      ctx.rect(bx - padX, by - padY, bw + padX * 2, bh + padY * 2 + 6);
      ctx.clip();
    }
    ctx.lineCap = 'round';
    ctx.shadowColor = t.color;

    // 1) RINGS spreading from where it broke through. Four, staggered, each flattening as it goes —
    //    an ellipse read at a glancing angle, not a circle on a wall. With no drawn waterline left,
    //    these and the foam ARE the water: the rings say where the surface is and the foam says what
    //    it is made of, which is why they are bright rather than a background detail.
    //
    //    Each ring is drawn as TWO ARCS, and this is what makes it a ring AROUND the message rather
    //    than a hoop painted over it: seen at a glancing angle, the far side of a ripple rides UP the
    //    screen and passes behind the thing in the water, while the near side runs in front. So the
    //    far arc is drawn with the block punched out of the clip (evenodd) — it vanishes behind the
    //    message — and the near arc is drawn normally, on top. The concept version got this for free
    //    by putting its whole canvas behind the block, which would also have hidden the spray thrown
    //    up in front; splitting the ring keeps both halves of the illusion.
    //
    //    Each arc is stroked twice — a soft tinted halo with a HAIRLINE WHITE core inside it, the same
    //    build as the bolt in entrance-strike. The brightness comes from that contrast, not from
    //    weight: fat tinted strokes just made the rings loud. This white does not bring back the
    //    meniscus problem — a highlight running along a curve reads as light on moving water, where a
    //    straight white line across the block's edge read as a rail the message was riding out on.
    const liveTop = by + ty;
    const holeBottom = Math.min(by + bh + ty, surfY); // the block's VISIBLE bottom while it crosses
    const ringArc = (rx: number, ry: number, from: number, to: number, a: number): void => {
      ctx!.strokeStyle = t.color;
      ctx!.shadowBlur = 10;
      ctx!.globalAlpha = clamp(a * 0.4, 0, 1);
      ctx!.lineWidth = 2.2;
      ctx!.beginPath();
      ctx!.ellipse(cx, surfY, rx, ry, 0, from, to);
      ctx!.stroke();
      ctx!.shadowBlur = 4;
      ctx!.globalAlpha = clamp(a * 0.9, 0, 1);
      ctx!.strokeStyle = '#ffffff';
      ctx!.lineWidth = 0.9;
      ctx!.beginPath();
      ctx!.ellipse(cx, surfY, rx, ry, 0, from, to);
      ctx!.stroke();
      ctx!.shadowBlur = 0;
    };
    for (let k = 0; k < 3; k++) {
      // Spread across the crossing window and NOTHING outside it: the last one is born two thirds of
      // the way through, so every ring exists before the block is clear of the water. A ring that
      // appears afterwards is the tell that these run on a timer rather than on the arrival.
      const rl = (ms - (t.pierceMs + ((t.clearMs - t.pierceMs) * k) / 3)) / RING_MS;
      if (rl <= 0 || rl >= 1) continue;
      // LINEAR, not eased. A ripple travels at a near-constant speed; easing it out fires the ring
      // away and then lets it crawl, which is the signature of a shockwave — the "sound wave, not
      // water" read. Nothing else in this effect is allowed to accelerate the surface either.
      const rx = bw * 0.35 + rl * (span * 0.75);
      // Tall enough for the far side to actually reach up behind the message; a ring that only ever
      // clears a few px below it has no far side to speak of.
      const ry = 5 + rl * 26;
      // Amplitude bleeds off as the ring spreads its energy over a longer circumference — bright for
      // most of the journey, then gone, rather than a linear dim.
      const a = Math.pow(1 - rl, 0.7) * waterA;
      if (a > 0.01 && holeBottom > liveTop) {
        ctx.save();
        ctx.beginPath();
        // Outer bound first, then the block as a hole. The outer must cover everything we may draw:
        // the clip region when mounted, the whole layer otherwise.
        if (t.clipTo) {
          const padX = Math.max(24, bh);
          const padY = Math.max(20, bh * 0.6);
          ctx.rect(bx - padX, by - padY, bw + padX * 2, bh + padY * 2 + 6);
        } else {
          ctx.rect(0, 0, cRect.width, cRect.height);
        }
        ctx.rect(bx, liveTop, bw, holeBottom - liveTop);
        ctx.clip('evenodd');
        ringArc(rx, ry, Math.PI, TAU, a); // the far side, riding up behind the block
        ctx.restore();
      }
      if (a > 0.01) ringArc(rx, ry, 0, Math.PI, a); // the near side, in front
    }

    // 2) SPRAY thrown up off the waterline and falling back in. Killed the moment it returns to the
    //    line — the whole point of a waterline is that nothing passes it unnoticed. Foam keeps coming
    //    while the water is still disturbed, so the whole population is faded out with the surface
    //    rather than each speck outliving the wave that threw it.
    for (const d of t.spray!) {
      const sec = (ms - d.ph) / 1000;
      if (sec <= 0) continue;
      const y = surfY - d.vy * sec + 700 * sec * sec; // up, then gravity takes it back
      if (y >= surfY) continue; // back in the water
      const x = bx + bw * d.u + d.vx * sec;
      const life = clamp(sec / (2 * (d.vy / 700)), 0, 1); // 0 at launch, 1 when it lands
      const size = d.sz * 2.6;
      const alpha = clamp((1 - life * 0.7) * (d.froth ? 0.7 : 0.85) * waterA, 0, 1);
      // Froth is drawn as the crisp core ALONE. At two or three px the coloured halo under it is a
      // smudge nobody can see, and skipping it halves the draw calls for two thirds of the swarm —
      // which is what pays for a swarm this size in the first place.
      if (!d.froth) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(t.sprite!, x - size / 2, y - size / 2, size, size);
      }
      const core = d.froth ? size : size * 0.42;
      ctx.globalAlpha = clamp(alpha * 1.1, 0, 1);
      ctx.drawImage(t.core!, x - core / 2, y - core / 2, core, core);
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
  // Hold the block hidden until the first laid-out frame puts it under the water (no height known yet,
  // so a 100% inset rather than a px one). No flash: applyEntrance runs before it is painted.
  setClip(el, 'inset(0 0 100% 0)');
  const t: Tide = {
    el,
    clipTo: mount === document.body ? null : mount,
    // Only a full #rrggbb is honoured; anything else (absent, malformed) falls back to the brand mint.
    color: color && /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : DEFAULT_COLOR,
    sprite: null,
    core: null,
    spray: null,
    pierceMs: 0,
    clearMs: 0,
    lastTy: 0,
    start: null,
    // If the element never lays out (removed mid-flight, a throttled background tab), don't leave the
    // message clipped away forever.
    safety: setTimeout(() => remove(t), DUR + 1500),
  };
  active.push(t);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => remove(t);
}

export const entranceTide: EntranceModule = {
  id: 'entrance-tide',
  type: 'entrance',
  // Below the portal: a canvas showpiece, but a calm one — it holds the message under water for half a
  // beat and then spends its tail on ripples, where the portal is spectacle from the first frame.
  costDust: 3000,
  since: '2026-07-29',
  fx: 'tide',
  labels: { name: 'shop.entranceTide', desc: 'shop.entranceTideDesc' },
  play,
  // No `css`: the whole effect is JS (transform + clip on the block, canvas for the water). data-fx
  // only needs to EXIST so the surface's own default entrance (:not([data-fx])) stands down.
};
