import { useEffect, useRef } from 'react';
import { useFidgetEnabled } from '@/hooks/useFidgetEnabled';

type Kind = 'amb' | 'comet' | 'spark';

interface Ent {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  // ambient twinkle
  baseA: number;
  tw: number;
  ph: number;
  // comet (летит из sx,sy в tx,ty за dur секунд)
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  trail: { x: number; y: number }[];
  // spark (искра взрыва)
  life: number;
}

const SKIP =
  'button,a,input,textarea,select,label,[role="dialog"],[role="listbox"],[role="option"],[aria-expanded]';

/**
 * Фоновая «жизнь»: редкие падающие мятные звёзды; клик по фону (не по интерактиву) запускает
 * комету из случайной точки сверху — она летит в курсор и взрывается там россыпью искр.
 * Канвас fixed, pointer-events:none (клики ловит window). rAF/canvas; гейт по перф-бюджету.
 */
export function BackgroundStars() {
  const enabled = useFidgetEnabled();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#8df0cc';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0;
    let H = 0;
    const ents: Ent[] = [];
    let raf = 0;
    let last = performance.now();

    const mkAmbient = (x: number, y: number): Ent => ({
      kind: 'amb',
      x,
      y,
      vx: (Math.random() - 0.5) * 5,
      vy: 7 + Math.random() * 16,
      r: 0.6 + Math.random() * 1.3,
      baseA: 0.14 + Math.random() * 0.28,
      tw: 0.4 + Math.random() * 0.7,
      ph: Math.random() * 6.28,
      sx: 0,
      sy: 0,
      tx: 0,
      ty: 0,
      t: 0,
      dur: 0,
      trail: [],
      life: 1,
    });
    const mkComet = (tx: number, ty: number): Ent => {
      const sx = Math.random() * W;
      const sy = -24;
      return {
        kind: 'comet',
        x: sx,
        y: sy,
        vx: 0,
        vy: 0,
        r: 2,
        baseA: 1,
        tw: 0,
        ph: 0,
        sx,
        sy,
        tx,
        ty,
        t: 0,
        dur: 0.5 + Math.random() * 0.25,
        trail: [],
        life: 1,
      };
    };
    const mkSpark = (x: number, y: number): Ent => {
      const a = Math.random() * 6.2832;
      const sp = 50 + Math.random() * 150;
      return {
        kind: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: 1.3 + Math.random() * 1.8,
        baseA: 1,
        tw: 0,
        ph: 0,
        sx: 0,
        sy: 0,
        tx: 0,
        ty: 0,
        t: 0,
        dur: 0,
        trail: [],
        life: 1,
      };
    };
    const explode = (x: number, y: number) => {
      for (let k = 0; k < 14; k++) ents.push(mkSpark(x, y));
    };

    const ensureSeed = () => {
      const target = Math.min(90, Math.round((W * H) / 26000));
      if (target > 0 && ents.filter((e) => e.kind === 'amb').length === 0) {
        for (let i = 0; i < target; i++) ents.push(mkAmbient(Math.random() * W, Math.random() * H));
      }
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width || window.innerWidth;
      H = rect.height || window.innerHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ensureSeed();
    };

    const dot = (x: number, y: number, r: number, alpha: number) => {
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.2832);
      ctx.fillStyle = accent;
      ctx.fill();
    };

    const onDown = (e: PointerEvent) => {
      const target = e.target;
      if (target instanceof Element && target.closest(SKIP)) return;
      ents.push(mkComet(e.clientX, e.clientY));
      if (ents.length > 400) ents.splice(0, ents.length - 400);
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, W, H);
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i]!;
        if (e.kind === 'amb') {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          if (e.y > H + 4) {
            e.y = -4;
            e.x = Math.random() * W;
          }
          dot(e.x, e.y, e.r, e.baseA * (0.55 + 0.45 * Math.sin(now * 0.001 * e.tw + e.ph)));
        } else if (e.kind === 'comet') {
          e.t += dt / e.dur;
          if (e.t >= 1) {
            explode(e.tx, e.ty);
            ents.splice(i, 1);
            continue;
          }
          const tt = e.t * e.t; // ease-in: ускоряется к цели
          e.x = e.sx + (e.tx - e.sx) * tt;
          e.y = e.sy + (e.ty - e.sy) * tt;
          e.trail.push({ x: e.x, y: e.y });
          if (e.trail.length > 12) e.trail.shift();
          for (let j = 0; j < e.trail.length; j++) {
            const p = e.trail[j]!;
            const f = j / e.trail.length;
            dot(p.x, p.y, e.r * f * 0.9 + 0.3, f * 0.6);
          }
          dot(e.x, e.y, e.r + 0.8, 1);
        } else {
          e.vy += 120 * dt;
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          e.life -= dt / 1.5;
          if (e.life <= 0) {
            ents.splice(i, 1);
            continue;
          }
          dot(e.x, e.y, e.r * Math.max(0.4, e.life), Math.min(1, e.life) * 0.9);
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('pointerdown', onDown);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointerdown', onDown);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-0 h-screen w-screen"
    />
  );
}
