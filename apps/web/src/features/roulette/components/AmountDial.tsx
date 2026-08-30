import { useEffect, useRef } from 'react';

/**
 * The stake, chosen by flicking a drum rather than typing into a box. A number field asks the
 * player to decide before they have touched anything; a drum lets them feel their way to an amount,
 * which is the difference between filling in a form and playing.
 *
 * Canvas, like the wheel: the same fonts and ticks, one context, and no thousand DOM nodes for a
 * ten-thousand-dust range.
 */

/** Pixels between two steps. Also the flick's unit — momentum is measured in these. */
const PITCH = 74;
/** Values move in tens: single dust is noise at these stakes, and a hundred is too coarse to feel. */
const GRAIN = 10;
/** Friction per millisecond. Tuned so a hard flick coasts a couple of seconds, a nudge barely moves. */
const DRAG = 0.0026;
/** Below this the drum is done coasting and snaps to the nearest step. */
const STILL = 0.05;
/** How far back velocity is measured. Long enough that a pause before letting go reads as a stop. */
const VEL_WINDOW_MS = 90;
/** How hard the drum pulls to the nearest step once it has stopped coasting. */
const SNAP = 0.16;

export function AmountDial({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Continuous position in steps; the committed value is this rounded. Kept as a float so the drum
   *  can sit between two numbers while it moves. */
  const pos = useRef(value / GRAIN);
  const vel = useRef(0);
  const raf = useRef(0);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const lastT = useRef(0);
  /** Recent pointer samples, newest last. Velocity comes from the span of these rather than from
   *  the last pair: a single 1px jitter over a 1ms frame reads as 1 px/ms, which under this
   *  friction throws the drum five steps — which is why placing it on a number by hand always
   *  ended up on the next one. Over a window, holding still for a moment IS zero velocity. */
  const samples = useRef<{ t: number; x: number }[]>([]);
  const maxRef = useRef(max);
  maxRef.current = max;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const steps = () => Math.max(1, Math.floor(max / GRAIN));

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
    const p = pos.current;
    const first = Math.floor(p - w / 2 / PITCH) - 1;
    const last = Math.ceil(p + w / 2 / PITCH) + 1;

    for (let i = first; i <= last; i++) {
      if (i < 1 || i > steps()) continue;
      const x = cx + (i - p) * PITCH;
      const d = Math.abs(x - cx) / (w / 2);
      // Fade and shrink away from the caret: the cylinder is faked, but the cue is the real one.
      const near = Math.max(0, 1 - d);
      ctx.globalAlpha = 0.16 + near * 0.84;
      ctx.fillStyle = d < 0.12 ? '#8df0cc' : 'rgba(233,240,238,0.95)';
      ctx.font = `${d < 0.12 ? 700 : 500} ${13 + near * 8}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i * GRAIN), x, h / 2 + 1);

      ctx.globalAlpha = 0.1 + near * 0.3;
      ctx.fillStyle = '#e9f0ee';
      ctx.fillRect(x - 0.5, h - 12, 1, 6);
    }
    ctx.globalAlpha = 1;

    // Edges dissolve instead of being clipped, so the strip reads as continuing past the box.
    const fade = ctx.createLinearGradient(0, 0, w, 0);
    fade.addColorStop(0, 'rgba(8,12,14,1)');
    fade.addColorStop(0.16, 'rgba(8,12,14,0)');
    fade.addColorStop(0.84, 'rgba(8,12,14,0)');
    fade.addColorStop(1, 'rgba(8,12,14,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, w, h);

    // The caret. Two brackets rather than a box: it marks a position without fencing the number in.
    ctx.strokeStyle = '#8df0cc';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.85;
    const half = 26;
    const top = h / 2 - 20;
    const bot = h / 2 + 20;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + s * half - s * 8, top);
      ctx.lineTo(cx + s * half, top);
      ctx.lineTo(cx + s * half, bot);
      ctx.lineTo(cx + s * half - s * 8, bot);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  /** Commit whatever the drum is nearest to, clamped — the caller owns the value, we own the feel. */
  const commit = () => {
    const v = Math.min(maxRef.current, Math.max(GRAIN, Math.round(pos.current) * GRAIN));
    onChangeRef.current(v);
  };

  const tick = (now: number) => {
    const dt = Math.min(34, now - lastT.current || 16);
    lastT.current = now;
    if (!dragging.current) {
      if (Math.abs(vel.current) > STILL) {
        pos.current += (vel.current * dt) / PITCH;
        vel.current *= Math.exp(-DRAG * dt);
      } else {
        vel.current = 0;
        const target = Math.round(pos.current);
        pos.current += (target - pos.current) * SNAP;
        if (Math.abs(target - pos.current) < 0.002) pos.current = target;
      }
      // Hitting an end kills the coast rather than letting it hang past the last number.
      const top = steps();
      if (pos.current < 1) {
        pos.current = 1;
        vel.current = 0;
      }
      if (pos.current > top) {
        pos.current = top;
        vel.current = 0;
      }
    }
    draw();
    commit();
    const idle = !dragging.current && vel.current === 0 && pos.current === Math.round(pos.current);
    if (idle) raf.current = 0;
    else raf.current = requestAnimationFrame(tick);
  };

  const wake = () => {
    if (!raf.current) {
      lastT.current = performance.now();
      raf.current = requestAnimationFrame(tick);
    }
  };

  useEffect(() => {
    const release = () => {
      if (!dragging.current) return;
      vel.current = 0;
      dragging.current = false;
      wake();
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    draw();
    const ro = new ResizeObserver(draw);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, []);

  // Follow the value when it is changed from outside (the Max shortcut, a cap that shrank).
  useEffect(() => {
    if (dragging.current || raf.current) return;
    pos.current = Math.min(steps(), Math.max(1, value / GRAIN));
    draw();
  }, [value, max]);

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety; the window listeners below are what actually end the gesture.
    }
    dragging.current = true;
    vel.current = 0;
    lastX.current = e.clientX;
    lastT.current = performance.now();
    samples.current = [{ t: lastT.current, x: e.clientX }];
    wake();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const now = performance.now();
    const dx = e.clientX - lastX.current;
    lastX.current = e.clientX;
    lastT.current = now;
    // Dragging right should reveal SMALLER numbers, the way pushing a real drum works.
    pos.current -= dx / PITCH;
    pos.current = Math.min(steps(), Math.max(1, pos.current));
    samples.current.push({ t: now, x: e.clientX });
    while (samples.current.length > 2 && now - samples.current[0]!.t > VEL_WINDOW_MS) {
      samples.current.shift();
    }
  };

  /** Velocity over the sample window, px/ms. Zero if the pointer was resting when it let go. */
  const flickVelocity = (): number => {
    const now = performance.now();
    const recent = samples.current.filter((s) => now - s.t <= VEL_WINDOW_MS);
    const first = recent[0];
    const last = recent[recent.length - 1];
    if (!first || !last || last.t - first.t < 15) return 0;
    // Stale window: the pointer sat still long enough that whatever it did before does not count.
    if (now - last.t > 60) return 0;
    return -(last.x - first.x) / (last.t - first.t);
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    vel.current = flickVelocity();
    dragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured */
    }
    wake();
  };

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      // Without this the browser claims the gesture for page scrolling and the drum never sees it.
      style={{ touchAction: 'none' }}
      className={`block h-[68px] w-full select-none ${disabled ? 'opacity-40' : 'cursor-grab active:cursor-grabbing'}`}
      aria-hidden="true"
    />
  );
}
