import { useEffect, useRef } from 'react';
import { useI18n } from '@/i18n';
import { useFidgetEnabled } from '@/hooks/useFidgetEnabled';

interface Dot {
  bx: number;
  by: number;
  ox: number;
  oy: number;
}

/**
 * Игрушка для простоя: когда очередь пуста, панель оживает под курсором — поле мятных точек
 * отталкивается/подсвечивается, а «T»-чип можно схватить и швырнуть (физика отскока).
 * Всё на canvas/transform + rAF. Под reduced-motion/тач/слабым железом — статичное сообщение.
 */
export function IdleQueue() {
  const { t } = useI18n();
  const enabled = useFidgetEnabled();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const chip = chipRef.current;
    if (!host || !canvas || !chip) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cs = getComputedStyle(host);
    const accent = cs.getPropertyValue('--color-accent').trim() || '#8df0cc';
    const base = cs.getPropertyValue('--color-muted').trim() || '#7a8180';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const CHIP = 44;

    let W = 0;
    let H = 0;
    let dots: Dot[] = [];
    let mx = -999;
    let my = -999;
    let px = 16;
    let py = 16;
    let vx = 0;
    let vy = 0;
    let drag = false;
    let lx = 0;
    let ly = 0;
    let lt = 0;
    let raf = 0;

    const placeChip = () => {
      chip.style.transform = `translate(${px}px, ${py}px)`;
    };
    const build = () => {
      const r = host.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = [];
      const g = 22;
      for (let y = g / 2; y < H; y += g)
        for (let x = g / 2; x < W; x += g) dots.push({ bx: x, by: y, ox: 0, oy: 0 });
      px = Math.min(px, Math.max(0, W - CHIP));
      py = Math.min(py, Math.max(0, H - CHIP));
      placeChip();
    };

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
    };
    const onLeave = () => {
      mx = -999;
      my = -999;
    };
    const onDown = (e: PointerEvent) => {
      drag = true;
      vx = 0;
      vy = 0;
      try {
        chip.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      lx = e.clientX;
      ly = e.clientY;
      lt = performance.now();
      e.preventDefault();
    };
    const onChipMove = (e: PointerEvent) => {
      if (!drag) return;
      px = Math.max(0, Math.min(W - CHIP, px + (e.clientX - lx)));
      py = Math.max(0, Math.min(H - CHIP, py + (e.clientY - ly)));
      const now = performance.now();
      const dt = Math.max(8, now - lt);
      vx = ((e.clientX - lx) / dt) * 16;
      vy = ((e.clientY - ly) / dt) * 16;
      lx = e.clientX;
      ly = e.clientY;
      lt = now;
      placeChip();
    };
    const onUp = () => {
      drag = false;
    };

    const frame = () => {
      ctx.clearRect(0, 0, W, H);
      const R = 64;
      for (const d of dots) {
        const dx = d.bx - mx;
        const dy = d.by - my;
        const dist = Math.hypot(dx, dy);
        const near = dist < R ? (R - dist) / R : 0;
        const ds = dist || 1;
        d.ox += (near * (dx / ds) * 18 - d.ox) * 0.18;
        d.oy += (near * (dy / ds) * 18 - d.oy) * 0.18;
        ctx.beginPath();
        ctx.arc(d.bx + d.ox, d.by + d.oy, 1.2 + near * 2.6, 0, 6.2832);
        ctx.fillStyle = near > 0.05 ? accent : base;
        ctx.globalAlpha = 0.32 + near * 0.62;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!drag) {
        px += vx;
        py += vy;
        vx *= 0.99;
        vy *= 0.99;
        if (px < 0) {
          px = 0;
          vx = -vx * 0.8;
        }
        if (px > W - CHIP) {
          px = W - CHIP;
          vx = -vx * 0.8;
        }
        if (py < 0) {
          py = 0;
          vy = -vy * 0.8;
        }
        if (py > H - CHIP) {
          py = H - CHIP;
          vy = -vy * 0.8;
        }
        if (Math.abs(vx) < 0.02) vx = 0;
        if (Math.abs(vy) < 0.02) vy = 0;
        placeChip();
      }
      raf = requestAnimationFrame(frame);
    };

    host.addEventListener('pointermove', onMove);
    host.addEventListener('pointerleave', onLeave);
    chip.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onChipMove);
    window.addEventListener('pointerup', onUp);
    const ro = new ResizeObserver(build);
    ro.observe(host);
    build();
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      chip.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onChipMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [enabled]);

  return (
    <div
      ref={hostRef}
      className="relative flex min-h-[clamp(220px,38vh,400px)] items-center justify-center overflow-hidden border border-border bg-surface-2"
    >
      {enabled && <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />}
      <p className="relative z-10 px-6 text-center text-sm text-muted">{t('dash.modEmpty')}</p>
      {enabled && (
        <button
          ref={chipRef}
          type="button"
          aria-label={t('dash.modQueue')}
          className="absolute left-0 top-0 z-20 flex size-11 cursor-grab touch-none select-none items-center justify-center border border-accent bg-accent font-mono text-lg font-bold text-accent-contrast outline-none active:cursor-grabbing"
        >
          T
        </button>
      )}
    </div>
  );
}
