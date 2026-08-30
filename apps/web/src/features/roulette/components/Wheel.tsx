import { useEffect, useRef } from 'react';
import { colorOfSlot, WHEEL_ORDER, type RouletteColor } from '@tmw/shared';
import { disintegrate } from '@/lib/burst';

/**
 * The wheel: the rim of a very large disc under glass, drawn on canvas.
 *
 * Canvas because wedges want to be wedges — laid out as rotated DOM rectangles they leave gaps at
 * the rim, and because the glass over them is one even-odd fill rather than a stack of layers. One
 * context, a dozen paths a frame, which is the budget every effect here is held to.
 *
 * The pockets are an INFINITE strip along the arc, not a closed ring: pocket `k` sits at `k · STEP`
 * with face `WHEEL_ORDER[k mod 37]`. Closing the ring would need 37 readable pockets to add up to
 * exactly 360°, which they don't, and forcing it leaves a seam that eventually rotates into view.
 */

/** Degrees per pocket. Sized so a handful sit across the visible arc: fewer reads as a slot
 *  machine, more and the pockets stop being distinguishable while moving. */
const STEP = 7;
const DEPTH = 66;
const TOP_PAD = 18;

/** The disc's radius, from the box it is drawn in. Fixed radii read as a different object on every
 *  screen — flat on a desktop, a tight bend on a phone — so it scales and then clamps. */
export function radiusFor(width: number): number {
  return Math.min(900, Math.max(420, width * 0.62));
}

/** Is this client point on the wheel's band? The drop test for a thrown chip, kept here because the
 *  geometry is: the band is drawn, never laid out, so there is no element to hit-test. */
export function overBand(canvas: HTMLCanvasElement | null, x: number, y: number): boolean {
  if (!canvas) return false;
  const box = canvas.getBoundingClientRect();
  const r = radiusFor(box.width);
  const dx = x - (box.left + box.width / 2);
  const dy = y - (box.top + TOP_PAD + r);
  const d = Math.hypot(dx, dy);
  return d <= r + 10 && d >= r - DEPTH - 10;
}

/** Half-width of the hole in the glass, in pockets. Wide enough to show the winner's neighbours —
 *  a hole one pocket wide would answer the question before the wheel had stopped asking it. */
const WINDOW_POCKETS = 1.6;

const FILL: Record<RouletteColor, string> = {
  red: '#b8342a',
  black: '#141a21',
  green: '#8df0cc',
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
  won = null,
  interior = false,
  canvasRef: externalRef,
  className = 'block h-[150px] w-full',
  onSettled,
}: {
  /** The pocket the server picked. The animation only ever agrees with it. */
  slot: number | null;
  spinning: boolean;
  /** The long crawl. Off where airtime is somebody else's to spend (the overlay). */
  suspense?: boolean;
  /** Colour being dragged over the wheel right now — lights the window's frame in it. */
  armed?: RouletteColor | null;
  /** The outcome this spin is travelling towards. Known in advance like the slot is, and used only
   *  on landing: the disc washes in it, which is the loudest way to answer "did I win" without
   *  making the player read anything. */
  won?: boolean | null;
  /** Fill the disc's inside, making the arc the boundary of whatever sits under it. */
  interior?: boolean;
  /** Handed out so a caller can hit-test the band (see overBand). */
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
  className?: string;
  /** Fired once the pointer has settled. The verdict, the balance and the burst all wait for it,
   *  or the result is given away while the wheel is still turning. */
  onSettled?: () => void;
}) {
  const ownRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = externalRef ?? ownRef;
  const rotation = useRef(0);
  const raf = useRef(0);
  /** The landing fade runs on its OWN handle. Settling flips `spinning`, which re-runs the spin
   *  effect, whose cleanup cancels `raf` — sharing one handle killed the fade on its first frame
   *  and froze the verdict light on screen forever, which is what "the effect never ends" was. */
  const fadeRaf = useRef(0);
  /** Deflection of the pointer, degrees. Positive leans it LEFT — the way the pockets travel. */
  const flap = useRef(0);
  /** 1 → 0 after landing: the winning pocket takes a rim light. */
  const flash = useRef(0);
  /** 1 → 0 after landing: light runs off the rim and down the disc. */
  const pulse = useRef(0);
  const wonRef = useRef<boolean | null>(won);
  wonRef.current = won;
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

    const R = radiusFor(w);
    const cx = w / 2;
    const cy = R + TOP_PAD;

    // The disc's inside is the drawer's body: everything under the band, clipped to the circle, so
    // the arc IS the boundary and there is no panel behind it.
    if (interior) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R - DEPTH + 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(9,13,15,0.94)';
      ctx.fill();
      ctx.restore();
    }
    const rot = rotation.current;
    const rad = (deg: number) => (deg * Math.PI) / 180;
    const centre = Math.round(rot / STEP);
    const span = Math.ceil(w / 2 / ((2 * Math.PI * R) / (360 / STEP))) + 2;

    for (let k = centre - span; k <= centre + span; k++) {
      const colour = colorOfSlot(faceOf(k));
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

    // Three subpaths, even-odd: the ring is covered once (filled), the hub twice (clear), and the
    // window twice (clear). Bounding it by the disc rather than the canvas is what lets the page
    // show through outside the arc.
    const glass = new Path2D();
    glass.arc(cx, cy, R + 1, 0, Math.PI * 2);
    glass.moveTo(cx + R - DEPTH, cy);
    glass.arc(cx, cy, R - DEPTH, 0, Math.PI * 2);
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

    // The verdict, as light spilling off the rim and running DOWN the disc — one pulse, along the
    // whole arc, that visibly ends. The wash this replaces tinted the entire platform and simply
    // faded, which read as the interface being broken rather than as an answer.
    if (pulse.current > 0 && wonRef.current !== null) {
      const hue = wonRef.current ? '141,240,204' : '229,72,77';
      const p1 = 1 - pulse.current;
      // Where the light has got to, and how far it has smeared out getting there.
      const mid = R - DEPTH - 6 - p1 * 240;
      const soft = 46 + p1 * 120;
      const peak = 0.42 * pulse.current ** 1.4;
      const g = ctx.createRadialGradient(
        cx,
        cy,
        Math.max(0, mid - soft),
        cx,
        cy,
        Math.max(1, mid + soft),
      );
      g.addColorStop(0, `rgba(${hue},0)`);
      g.addColorStop(0.42, `rgba(${hue},${peak * 0.55})`);
      g.addColorStop(0.5, `rgba(${hue},${peak})`);
      g.addColorStop(0.62, `rgba(${hue},${peak * 0.45})`);
      g.addColorStop(1, `rgba(${hue},0)`);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, R - DEPTH, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      // The rim it came off, lit briefly and softly — a glow, not an outline.
      ctx.save();
      ctx.globalAlpha = Math.max(0, pulse.current * 2 - 1) * 0.8;
      ctx.strokeStyle = `rgba(${hue},0.5)`;
      ctx.lineWidth = 2;
      ctx.shadowColor = `rgb(${hue})`;
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(cx, cy, R - DEPTH - 1, Math.PI, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

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
    return () => {
      ro.disconnect();
      cancelAnimationFrame(fadeRaf.current);
    };
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
    cancelAnimationFrame(fadeRaf.current);
    const t0 = performance.now();
    const travel = to - from;
    let lastEdge = Math.round(from / STEP);
    flash.current = 0;
    pulse.current = 0;

    const land = () => {
      flap.current = 0;
      flash.current = 1;
      pulse.current = 1;
      onSettled?.();
      const t1 = performance.now();
      const fade = (now: number) => {
        const dt = now - t1;
        flash.current = Math.max(0, 1 - dt / 700);
        // Slightly longer than the rim light, and it reaches zero: an effect with no end is what
        // made the last one feel like a bug.
        pulse.current = Math.max(0, 1 - dt / 900);
        draw();
        if (flash.current > 0 || pulse.current > 0) fadeRaf.current = requestAnimationFrame(fade);
        else fadeRaf.current = 0;
      };
      fadeRaf.current = requestAnimationFrame(fade);
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

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}

/**
 * The dashboard's own decision burst, over the wheel. Same particles the moderation queue throws,
 * so a win reads like an approval there rather than like a new effect nobody has seen.
 *
 * Scaled by the multiple won, because `disintegrate` derives its particle count from the rect's
 * AREA: a pointer-sized rect yields about seven specks, which for a ×35 reads as a bug.
 */
export function burstAt(canvas: HTMLCanvasElement | null, multiple: number): void {
  if (!canvas) return;
  const box = canvas.getBoundingClientRect();
  const won = multiple > 0;
  const R = radiusFor(box.width);
  const cy = box.top + TOP_PAD + R;
  const cx = box.left + box.width / 2;
  const halfSpan = Math.min(Math.asin(Math.min(1, box.width / 2 / R)), Math.PI / 2);

  // ONE particle per call, at a uniformly random angle. Sampling a handful of fixed points and
  // asking each for six particles reads as that many little fountains; the edge has to come apart
  // along its whole length, which means the spawn positions must be continuous, not gridded.
  const emit = (n: number) => {
    for (let i = 0; i < n; i++) {
      const ang = -halfSpan + Math.random() * 2 * halfSpan;
      const x = cx + Math.sin(ang) * R;
      const y = cy - Math.cos(ang) * R;
      disintegrate(new DOMRect(x - 1, y - 3, 2, 4), won ? 'approve' : 'reject', 0, 1);
    }
  };

  const total = won ? (multiple > 2 ? 150 : 90) : 70;
  emit(Math.round(total * 0.5));
  // Two more waves, so it keeps going a beat past where the eye expects it to be over.
  setTimeout(() => emit(Math.round(total * 0.3)), 110);
  setTimeout(() => emit(Math.round(total * 0.2)), 230);
}
