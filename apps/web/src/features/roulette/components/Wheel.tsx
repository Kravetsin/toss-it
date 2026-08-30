import { useEffect, useRef } from 'react';
import { colorOfSlot, WHEEL_ORDER, type RouletteColor } from '@tmw/shared';
import { disintegrate } from '@/lib/burst';

/**
 * The wheel: the rim of a very large disc under glass, drawn on canvas.
 *
 * Canvas because wedges want to be wedges — laid out as rotated DOM rectangles they leave gaps at
 * the rim, and a conic-gradient cannot carry the numbers. It is also the cheaper of the two: one
 * context, a dozen paths a frame, which is the budget every effect here is held to.
 *
 * The pockets are an INFINITE strip along the arc, not a closed ring: pocket `k` sits at `k · STEP`
 * with face `WHEEL_ORDER[k mod 37]`. Closing the ring would need 37 readable pockets to add up to
 * exactly 360°, which they don't, and forcing it leaves a seam that eventually rotates into view.
 */

/** Degrees per pocket. Sized so ~8 sit in the window: fewer reads as a slot machine, more and the
 *  numbers stop being legible while moving. */
const STEP = 7;
const R = 560;
const DEPTH = 62;
const TOP_PAD = 18;

/** Half-width of the hole in the glass, in pockets. Wide enough to show the winner's neighbours —
 *  a hole one pocket wide would answer the question before the wheel had stopped asking it. */
const WINDOW_POCKETS = 1.6;

const FILL: Record<RouletteColor, string> = {
  red: '#b8342a',
  black: '#141a21',
  green: '#8df0cc',
};
const TEXT: Record<RouletteColor, string> = {
  red: 'rgba(255,255,255,0.92)',
  black: 'rgba(255,255,255,0.74)',
  green: '#08160f',
};

/**
 * ONE curve, start to stop. An earlier version braked to a halt and then crept to the next pocket,
 * which was worse than no suspense at all: a wheel that stops on red and then moves has announced
 * that the answer is its neighbour, and the restart read as a glitch. A single decelerating curve
 * never stops, so nothing is announced — and the exponent is what buys the crawl.
 *
 * remaining(p) = (1 − p)^EXP. At 2.6 the last pocket and a half take the final fifth of the spin,
 * which is a real crawl; a quartic instead spends its last second not moving at all, which reads
 * as a hang rather than as tension.
 */
const EXP_SLOW = 2.6;
const EXP_FAST = 2;
const MS_SLOW = 4000;
const MS_FAST = 2000;
/** Whole turns before landing. Past this the eye stops tracking and it reads as a wait. */
const TURNS = 3;

export const SPIN_MS = MS_SLOW;

const angleOf = (k: number) => k * STEP;

function faceOf(k: number): number {
  const i = ((k % WHEEL_ORDER.length) + WHEEL_ORDER.length) % WHEEL_ORDER.length;
  return WHEEL_ORDER[i]!;
}

export function Wheel({
  slot,
  spinning,
  suspense = true,
  armed = null,
  onSettled,
}: {
  /** The pocket the server picked. The animation only ever agrees with it. */
  slot: number | null;
  spinning: boolean;
  /** The long crawl. Off where airtime is somebody else's to spend (the overlay). */
  suspense?: boolean;
  /** Colour being dragged over the wheel right now — lights the window's frame in it. */
  armed?: RouletteColor | null;
  /** Fired once the pointer has settled. The verdict, the balance and the burst all wait for it,
   *  or the result is given away while the wheel is still turning. */
  onSettled?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotation = useRef(0);
  const raf = useRef(0);
  /** Deflection of the pointer, degrees. Positive leans it LEFT — the way the pockets travel. */
  const flap = useRef(0);
  /** 1 → 0 after landing: the winning pocket takes a rim light. */
  const flash = useRef(0);
  const armedRef = useRef<RouletteColor | null>(armed);
  armedRef.current = armed;

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
    const centre = Math.round(rot / STEP);
    const span = Math.ceil(w / 2 / ((2 * Math.PI * R) / (360 / STEP))) + 2;

    for (let k = centre - span; k <= centre + span; k++) {
      const face = faceOf(k);
      const colour = colorOfSlot(face);
      const mid = rad(angleOf(k) - rot) - Math.PI / 2;
      const half = rad(STEP / 2);

      ctx.beginPath();
      ctx.arc(cx, cy, R, mid - half, mid + half);
      ctx.arc(cx, cy, R - DEPTH, mid + half, mid - half, true);
      ctx.closePath();
      ctx.fillStyle = FILL[colour];
      ctx.fill();
      if (flash.current > 0 && Math.abs(angleOf(k) - rot) < STEP / 2) {
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

      // Numbers ride the wheel: upright at the top, tilting away at the edges — that is what says
      // "disc" more than the curve of the rim alone does.
      const tr = R - DEPTH / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(mid) * tr, cy + Math.sin(mid) * tr);
      ctx.rotate(mid + Math.PI / 2);
      ctx.fillStyle = TEXT[colour];
      ctx.font = '600 15px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(face), 0, 0);
      ctx.restore();
    }

    // Depth toward the hub. A RADIAL gradient because the band is an arc: the straight fillRect
    // this replaces drew a bar across the middle of the box, which is the one thing an arc has not.
    const shade = ctx.createRadialGradient(cx, cy, R - DEPTH, cx, cy, R);
    shade.addColorStop(0, 'rgba(0,0,0,0.5)');
    shade.addColorStop(0.35, 'rgba(0,0,0,0.1)');
    shade.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.arc(cx, cy, R - DEPTH, 0, Math.PI * 2, true);
    ctx.fillStyle = shade;
    ctx.fill('evenodd');

    // The glass: everything except a wedge over the pointer. One fill, two subpaths, even-odd — so
    // the hole follows the arc instead of being a rectangle pretending the rim is straight.
    const halfWin = rad(STEP * WINDOW_POCKETS);
    const top = -Math.PI / 2;
    const winPath = new Path2D();
    winPath.arc(cx, cy, R + 7, top - halfWin, top + halfWin);
    winPath.arc(cx, cy, R - DEPTH - 7, top + halfWin, top - halfWin, true);
    winPath.closePath();

    const glass = new Path2D();
    glass.rect(0, 0, w, h);
    glass.addPath(winPath);
    ctx.fillStyle = 'rgba(5,9,11,0.68)';
    ctx.fill(glass, 'evenodd');

    // A raking sheen, so it reads as glass rather than as a layer someone dimmed.
    const sheen = ctx.createLinearGradient(0, 0, w * 0.65, h);
    sheen.addColorStop(0, 'rgba(255,255,255,0.06)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.014)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fill(glass, 'evenodd');

    // The frame around the hole. One tone, one motif: a lit inner line and a dim outer one. It must
    // not compete for attention with what is inside it, which is the whole reason the hole exists.
    const tint = armedRef.current ? FILL[armedRef.current] : '#8df0cc';
    ctx.save();
    ctx.strokeStyle = tint;
    ctx.globalAlpha = armedRef.current ? 0.95 : 0.55;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = tint;
    ctx.shadowBlur = armedRef.current ? 16 : 6;
    ctx.stroke(winPath);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    const outer = new Path2D();
    outer.arc(cx, cy, R + 13, top - halfWin - rad(1.3), top + halfWin + rad(1.3));
    outer.arc(cx, cy, R - DEPTH - 13, top + halfWin + rad(1.3), top - halfWin - rad(1.3), true);
    outer.closePath();
    ctx.stroke(outer);
    ctx.restore();

    // The pointer, pivoting at its top. Kicked by every pocket edge that passes under it — the
    // flapper is what makes a wheel feel mechanical rather than animated.
    ctx.save();
    ctx.translate(cx, TOP_PAD - 8);
    ctx.rotate(rad(flap.current));
    ctx.beginPath();
    ctx.moveTo(0, 27);
    ctx.lineTo(-8, -4);
    ctx.lineTo(8, -4);
    ctx.closePath();
    ctx.fillStyle = '#f4f7f5';
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 7;
    ctx.fill();
    ctx.restore();
  };

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
    // Mount only: `draw` closes over refs, never over state, so it cannot go stale.
  }, []);

  // Redraw on an arming change even while idle, so the frame lights under a dragged chip.
  useEffect(() => {
    if (!spinning) draw();
  }, [armed, spinning]);

  useEffect(() => {
    if (!spinning || slot === null) return;
    if (!WHEEL_ORDER.includes(slot)) return;

    const reduce =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Land on a pocket that is both the right face and far enough ahead to spin towards. The strip
    // is infinite, so "ahead" is just a bigger k — no modular arithmetic at the finish line.
    const from = rotation.current;
    let target = Math.round(from / STEP) + TURNS * WHEEL_ORDER.length;
    while (faceOf(target) !== slot) target++;
    const to = angleOf(target);

    if (reduce) {
      rotation.current = to;
      flap.current = 0;
      draw();
      onSettled?.();
      return;
    }

    const total = suspense ? MS_SLOW : MS_FAST;
    const exp = suspense ? EXP_SLOW : EXP_FAST;
    const t0 = performance.now();
    const travel = to - from;
    let lastEdge = Math.round(from / STEP);
    flash.current = 0;

    const land = () => {
      flap.current = 0;
      flash.current = 1;
      onSettled?.();
      const t1 = performance.now();
      const fade = (now: number) => {
        flash.current = Math.max(0, 1 - (now - t1) / 700);
        draw();
        if (flash.current > 0) raf.current = requestAnimationFrame(fade);
      };
      raf.current = requestAnimationFrame(fade);
    };

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / total);
      rotation.current = to - travel * (1 - p) ** exp;

      const edge = Math.round(rotation.current / STEP);
      if (edge !== lastEdge) {
        lastEdge = edge;
        // Positive leans the tip LEFT, the way the pockets travel: a flapper is dragged by what
        // passes under it, so leaning with the motion is the only direction that reads as physical.
        flap.current = 13;
      }
      flap.current += (0 - flap.current) * 0.2;

      draw();
      if (p < 1) raf.current = requestAnimationFrame(step);
      else land();
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // Deliberately not depending on `onSettled`: a caller passing a fresh closure would restart the
    // spin mid-flight, which is worse than calling a callback one render old.
  }, [spinning, slot, suspense]);

  return <canvas ref={canvasRef} className="block h-[150px] w-full" aria-hidden="true" />;
}

/**
 * The dashboard's own decision burst, over the wheel. Same particles the moderation queue throws,
 * so a win reads like an approval there rather than like a new effect nobody has seen.
 *
 * Scaled by the multiple won, because `disintegrate` derives its particle count from the rect's
 * AREA: a pointer-sized rect yields about seven specks, which for a ×35 reads as a bug.
 */
export function burstAt(el: HTMLElement | null, multiple: number): void {
  if (!el) return;
  const box = el.getBoundingClientRect();
  if (multiple <= 0) {
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
