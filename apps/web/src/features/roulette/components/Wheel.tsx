import { useEffect, useRef } from 'react';
import { colorOfSlot, WHEEL_ORDER } from '@tmw/shared';
import { disintegrate } from '@/lib/burst';

/**
 * The wheel as the top of a very large disc, drawn on canvas.
 *
 * Canvas rather than DOM because wedges want to be wedges: laid out as rotated rectangles they
 * leave visible gaps at the rim, and a conic-gradient can't carry the numbers. It is also the
 * cheaper of the two — one context, a dozen paths a frame, which is the render budget every
 * cosmetic here is held to.
 *
 * The pockets are an INFINITE strip along the arc, not a closed ring: pocket `k` always sits at
 * `k · STEP` and its face is `WHEEL_ORDER[k mod 37]`. A closed ring would need the 37 pockets to
 * add up to exactly 360°, which at a readable pocket size they don't — and forcing it leaves a
 * seam that eventually rotates through the window.
 */

/** Degrees per pocket. Sized so ~8 pockets sit in the window: fewer reads as a slot machine, more
 *  and the numbers stop being legible while moving. */
const STEP = 7;
/** Radius of the disc. Big enough that the rim looks like part of something huge, small enough
 *  that the arc visibly curves away at the edges. */
const R = 560;
/** How deep the coloured band is. */
const DEPTH = 62;
/** Distance from the top of the canvas to the rim at its highest point. */
const TOP_PAD = 16;

const FILL: Record<string, string> = {
  red: '#b8342a',
  black: '#141a21',
  green: '#8df0cc',
};
const TEXT: Record<string, string> = {
  red: 'rgba(255,255,255,0.92)',
  black: 'rgba(255,255,255,0.72)',
  green: '#08160f',
};

/** The fast pass, then the crawl. The crawl is what makes it worth watching: the pointer sits on a
 *  boundary and has to be watched over it, which no amount of deceleration alone produces. */
const FAST_MS = 2300;
const CREEP_MS = 1300;
/** How much of the travel the crawl gets — just over one pocket, so it visibly crosses an edge. */
const CREEP_ARC = STEP * 1.35;
/** Whole turns before landing. Not more: past this the eye stops tracking and it reads as a wait. */
const TURNS = 4;

export const SPIN_MS = FAST_MS + CREEP_MS;
/** Without the crawl — what the overlay will use, where airtime is somebody else's to spend. */
export const SPIN_MS_SHORT = FAST_MS;

const easeOutQuart = (p: number) => 1 - (1 - p) ** 4;
const easeOutQuad = (p: number) => 1 - (1 - p) ** 2;

/** Where pocket `k` lives, in degrees. Any integer, including negative — the strip never wraps. */
const angleOf = (k: number) => k * STEP;

function faceOf(k: number): number {
  const i = ((k % WHEEL_ORDER.length) + WHEEL_ORDER.length) % WHEEL_ORDER.length;
  return WHEEL_ORDER[i]!;
}

export function Wheel({
  slot,
  spinning,
  suspense = true,
  onSettled,
}: {
  /** The pocket the server picked. The animation only has to agree with it. */
  slot: number | null;
  spinning: boolean;
  /** The crawl at the end. Off for surfaces that cannot afford the extra second. */
  suspense?: boolean;
  /** Fired once the pointer has settled, with whether this was a win — drives the burst and the
   *  verdict line, so neither can appear before the wheel has actually stopped. */
  onSettled?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(0);
  const raf = useRef(0);
  const flap = useRef(0);
  /** 1 → 0 after landing: the pocket under the pointer glows, so the eye is told where to look
   *  before the verdict line has even rendered. */
  const flash = useRef(0);
  const settled = useRef<number | null>(null);

  // Draw whenever asked; the loop owns `rotation.current` and this only reads it.
  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = R + TOP_PAD;
    const rot = rotation.current;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    // Only the pockets that can reach the window; the strip is infinite, the loop is not.
    const centre = Math.round(rot / STEP);
    const span = Math.ceil(w / 2 / ((2 * Math.PI * R) / (360 / STEP))) + 2;

    for (let k = centre - span; k <= centre + span; k++) {
      const face = faceOf(k);
      const colour = colorOfSlot(face);
      // Offset from straight up, in canvas angles (0 = +x, so up is −90°).
      const mid = rad(angleOf(k) - rot) - Math.PI / 2;
      const half = rad(STEP / 2);

      ctx.beginPath();
      ctx.arc(cx, cy, R, mid - half, mid + half);
      ctx.arc(cx, cy, R - DEPTH, mid + half, mid - half, true);
      ctx.closePath();
      ctx.fillStyle = FILL[colour]!;
      ctx.fill();
      // The pocket the pointer is on, once we have stopped: a rim light rather than a tint, so the
      // colour it landed on stays exactly the colour it landed on.
      const under = Math.abs(angleOf(k) - rot) < STEP / 2;
      if (flash.current > 0 && under) {
        ctx.save();
        ctx.globalAlpha = flash.current;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 18 * flash.current;
        ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Numbers ride the wheel: upright at the top, tilting away towards the edges, which is what
      // says "this is a disc" more than the curve of the rim alone does.
      const tr = R - DEPTH / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * tr, cy + Math.sin(mid) * tr);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = TEXT[colour]!;
      ctx.font = '600 15px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(face), 0, 0);
      ctx.restore();
    }

    // Inner shadow at the hub side, so the band reads as the rim of something rather than a stripe.
    const fade = ctx.createLinearGradient(0, cy - R + DEPTH - 14, 0, cy - R + DEPTH);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, cy - R + DEPTH - 14, w, 14);

    // The pointer. It pivots at its tip and is kicked by every pocket edge that passes under it —
    // the flapper is the part that makes a wheel feel mechanical instead of animated.
    ctx.save();
    ctx.translate(cx, TOP_PAD - 2);
    ctx.rotate(rad(flap.current));
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.lineTo(-9, -6);
    ctx.lineTo(9, -6);
    ctx.closePath();
    ctx.fillStyle = '#f4f7f5';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();
  };

  // Static first paint, and a redraw when the box is resized under us.
  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
    // Mount only: `draw` closes over refs, never over state, so it never goes stale.
  }, []);

  useEffect(() => {
    if (!spinning || slot === null) return;
    const landing = WHEEL_ORDER.indexOf(slot);
    if (landing < 0) return;

    const reduce =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Land on a pocket that is BOTH the right face and far enough ahead to spin towards. The strip
    // is infinite, so "ahead" is just a bigger k — no modular arithmetic at the finish line.
    const from = rotation.current;
    const startK = Math.round(from / STEP);
    let target = startK + TURNS * WHEEL_ORDER.length;
    while (faceOf(target) !== slot) target++;
    const to = angleOf(target);

    if (reduce) {
      rotation.current = to;
      flap.current = 0;
      flash.current = 0;
      draw();
      onSettled?.();
      return;
    }

    const total = SPIN_MS * (suspense ? 1 : FAST_MS / SPIN_MS);
    const fastMs = suspense ? FAST_MS : total;
    const creepFrom = to - (suspense ? CREEP_ARC : 0);
    const t0 = performance.now();
    let lastEdge = Math.round(from / STEP);
    settled.current = null;
    flash.current = 0;

    const step = (now: number) => {
      const t = now - t0;
      let angle: number;
      if (t < fastMs) {
        angle = from + (creepFrom - from) * easeOutQuart(t / fastMs);
      } else if (suspense && t < total) {
        angle = creepFrom + CREEP_ARC * easeOutQuad((t - fastMs) / CREEP_MS);
      } else {
        angle = to;
      }
      rotation.current = angle;

      // Kick the pointer once per pocket edge crossed, and let it spring back. At the crawl this
      // fires once, right at the moment the edge creeps under the tip — which is the whole point.
      const edge = Math.round(angle / STEP);
      if (edge !== lastEdge) {
        lastEdge = edge;
        flap.current = -14;
      }
      flap.current += (0 - flap.current) * 0.22;

      draw();
      if (t < total) {
        raf.current = requestAnimationFrame(step);
      } else {
        flap.current = 0;
        if (settled.current === null) {
          settled.current = slot;
          flash.current = 1;
          onSettled?.();
          const fade = (at: number) => {
            flash.current = Math.max(0, 1 - (at - now) / 700);
            draw();
            if (flash.current > 0) raf.current = requestAnimationFrame(fade);
          };
          raf.current = requestAnimationFrame(fade);
        } else {
          draw();
        }
      }
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // Deliberately not depending on `onSettled`: a caller passing a fresh closure would restart the
    // spin mid-flight, which is worse than calling a callback one render old.
  }, [spinning, slot, suspense]);

  return (
    <div className="relative overflow-hidden rounded-[var(--radius)] border border-white/10 bg-black/40">
      <canvas ref={canvasRef} className="block h-[132px] w-full" aria-hidden="true" />
    </div>
  );
}

/**
 * Fire the dashboard's own decision burst over the wheel — the same particles the moderation queue
 * throws, so a win reads like an approval there rather than like a new effect nobody has seen.
 *
 * Scaled by what was won, because `disintegrate` derives its particle count from the rect's AREA: a
 * pointer-sized rect yields about seven specks, which for a jackpot reads as a bug. A ×2 gets the
 * pocket, a ×35 gets the whole rim and a second wave.
 */
export function burstAt(el: HTMLElement | null, multiple: number): void {
  if (!el) return;
  const box = el.getBoundingClientRect();
  if (multiple <= 0) {
    // A loss stays small and local: shards off the pointer, not a shower over the whole wheel.
    disintegrate(new DOMRect(box.left + box.width / 2 - 90, box.top, 180, box.height), 'reject');
    return;
  }
  const wide = multiple > 2;
  const w = wide ? box.width : Math.min(box.width, 280);
  disintegrate(new DOMRect(box.left + box.width / 2 - w / 2, box.top, w, box.height), 'approve');
  // The jackpot gets a second wave a beat later, so it keeps going after the eye expects it to stop.
  if (wide) {
    setTimeout(
      () => disintegrate(new DOMRect(box.left, box.top, box.width, box.height), 'approve'),
      220,
    );
  }
}
