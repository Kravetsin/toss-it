import { useEffect, useRef } from 'react';
import { useFidgetEnabled } from '@/hooks/useFidgetEnabled';

type Kind = 'amb' | 'comet' | 'spark' | 'launch' | 'keep' | 'cosmos';

// Static stars cap; ignited in-place (cheap), but capped anyway.
const MAX_COSMOS_STARS = 700;
// Cap for all canvas entities (stars + comets + sparks).
const ENT_CAP = 900;

// Imperative API for live canvas. Active only when mounted + fidgets enabled; else no-op.
interface StarsApi {
  launchKeepsake: (point: { x: number; y: number }) => void;
  inhale: () => void;
  populateCosmos: (count: number) => void;
  recolor: () => void;
}
let starsApi: StarsApi | null = null;

export function launchKeepsake(point: { x: number; y: number }): void {
  starsApi?.launchKeepsake(point);
}

export function inhaleStars(): void {
  starsApi?.inhale();
}

export function populateCosmos(count: number): void {
  starsApi?.populateCosmos(count);
}

/** Re-read --color-accent and repaint with it — for the live theme preview (see useChannelTheme). */
export function recolorStars(): void {
  starsApi?.recolor();
}

interface Ent {
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  baseA: number;
  tw: number;
  ph: number;
  // Comet trajectory: from (sx,sy) to (tx,ty) over dur seconds
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  trail: { x: number; y: number }[];
  life: number;
  // Random ignition delay (prevents all cosmos stars from flashing at once)
  delay?: number;
}

const SKIP =
  'button,a,input,textarea,select,label,[role="dialog"],[role="listbox"],[role="option"],[aria-expanded]';

export function BackgroundStars({ staticMode = false }: { staticMode?: boolean }) {
  const enabled = useFidgetEnabled();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Accent + its RGB (for the white-blend on cosmos ignition), re-readable so the theme preview
    // can repaint the sky live. Mutated in place by recolor(); the draw loop reads these each frame.
    let accent = '#8df0cc';
    let aR = 141;
    let aG = 240;
    let aB = 204;
    const readAccent = () => {
      accent =
        getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() ||
        '#8df0cc';
      const ah = accent.replace('#', '');
      aR = parseInt(ah.slice(0, 2), 16) || 141;
      aG = parseInt(ah.slice(2, 4), 16) || 240;
      aB = parseInt(ah.slice(4, 6), 16) || 204;
    };
    readAccent();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0;
    let H = 0;
    const ents: Ent[] = [];
    let raf = 0;
    let last = performance.now();
    // Transient upward impulse (see inhale); decays each frame
    let surge = 0;

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
      // Resizing clears the canvas; in the frozen preview there's no loop to repaint it.
      if (staticMode && W > 0 && H > 0) drawOnce();
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
      if (ents.length > ENT_CAP) ents.splice(0, ents.length - ENT_CAP);
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      surge *= 0.9;
      if (surge < 0.5) surge = 0;
      ctx.clearRect(0, 0, W, H);
      for (let i = ents.length - 1; i >= 0; i--) {
        const e = ents[i]!;
        if (e.kind === 'amb') {
          e.x += e.vx * dt;
          // Surge: transient upward impulse; decays as stars resume falling
          e.y += (e.vy - surge) * dt;
          if (e.y > H + 4) {
            e.y = -4;
            e.x = Math.random() * W;
          } else if (e.y < -8) {
            e.y = H + 4;
            e.x = Math.random() * W;
          }
          dot(e.x, e.y, e.r, e.baseA * (0.55 + 0.45 * Math.sin(now * 0.001 * e.tw + e.ph)));
        } else if (e.kind === 'keep') {
          dot(e.x, e.y, e.r, 0.6 + 0.4 * Math.sin(now * 0.001 * e.tw + e.ph));
        } else if (e.kind === 'cosmos') {
          if (e.delay && e.delay > 0) {
            e.delay -= dt;
            continue; // Still transparent; skip render
          }
          // Unified formula: smooth appear + white flash fading to steady twinkle
          if (e.t < 5) e.t += dt;
          const tt = e.t;
          const appear = Math.min(1, tt / 0.7);
          const twk = 0.66 + 0.34 * Math.sin(now * 0.001 * e.tw + e.ph);
          const fd = tt - 1.1;
          const flash = appear * Math.exp(-(fd * fd) / 0.4);
          const wt = flash * 0.9;
          const alpha = Math.min(1, e.baseA * appear * (twk + flash * 0.8));
          // Soft glow (radial gradient only during flash)
          if (flash > 0.05) {
            const gr = e.r * (3 + flash * 5);
            const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, gr);
            g.addColorStop(0, `rgba(${aR},${aG},${aB},${(flash * 0.5).toFixed(3)})`);
            g.addColorStop(1, `rgba(${aR},${aG},${aB},0)`);
            ctx.globalAlpha = 1;
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(e.x, e.y, gr, 0, 6.2832);
            ctx.fill();
          }
          // Core (accent to white on flash)
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r, 0, 6.2832);
          ctx.fillStyle =
            wt > 0.01
              ? `rgb(${(aR + (255 - aR) * wt) | 0},${(aG + (255 - aG) * wt) | 0},${(aB + (255 - aB) * wt) | 0})`
              : accent;
          ctx.fill();
        } else if (e.kind === 'launch') {
          e.t += dt / e.dur;
          if (e.t >= 1) {
            // Landed: leave permanent star and spark burst
            ents.push({
              kind: 'keep',
              x: e.tx,
              y: e.ty,
              vx: 0,
              vy: 0,
              r: 1.7,
              baseA: 1,
              tw: 0.5 + Math.random() * 0.6,
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
            explode(e.tx, e.ty);
            ents.splice(i, 1);
            continue;
          }
          // Ease-out: sharp start, slows near destination
          const tt = 1 - (1 - e.t) * (1 - e.t);
          e.x = e.sx + (e.tx - e.sx) * tt;
          e.y = e.sy + (e.ty - e.sy) * tt;
          e.trail.push({ x: e.x, y: e.y });
          if (e.trail.length > 14) e.trail.shift();
          for (let j = 0; j < e.trail.length; j++) {
            const p = e.trail[j]!;
            const f = j / e.trail.length;
            dot(p.x, p.y, e.r * f * 0.9 + 0.3, f * 0.7);
          }
          dot(e.x, e.y, e.r + 0.6, 1);
        } else if (e.kind === 'comet') {
          e.t += dt / e.dur;
          if (e.t >= 1) {
            explode(e.tx, e.ty);
            ents.splice(i, 1);
            continue;
          }
          // Ease-in: accelerates toward target
          const tt = e.t * e.t;
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
      if (!staticMode) raf = requestAnimationFrame(frame);
    };
    // Preview embeds render one frozen frame instead of a loop: a scaled iframe re-composites its
    // whole layer on every animated frame, which tanks the dashboard's perf. See ChannelShell.
    const drawOnce = () => frame(performance.now());

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    window.addEventListener('pointerdown', onDown);
    if (staticMode) drawOnce();
    else raf = requestAnimationFrame(frame);

    starsApi = {
      launchKeepsake: (point) => {
        const tx = 30 + Math.random() * Math.max(40, W - 60);
        const ty = 24 + Math.random() * 50;
        ents.push({
          kind: 'launch',
          x: point.x,
          y: point.y,
          vx: 0,
          vy: 0,
          r: 2.2,
          baseA: 1,
          tw: 0,
          ph: 0,
          sx: point.x,
          sy: point.y,
          tx,
          ty,
          t: 0,
          dur: 0.9,
          trail: [],
          life: 1,
        });
        if (ents.length > ENT_CAP) ents.splice(0, ents.length - ENT_CAP);
      },
      inhale: () => {
        surge = 140;
      },
      recolor: () => {
        readAccent();
        if (staticMode) drawOnce();
      },
      populateCosmos: (count) => {
        const n = Math.min(Math.max(0, Math.floor(count)), MAX_COSMOS_STARS);
        for (let i = 0; i < n; i++) {
          ents.push({
            kind: 'cosmos',
            x: Math.random() * W,
            y: Math.random() * H,
            vx: 0,
            vy: 0,
            r: 0.8 + Math.random() * 1.3,
            baseA: 0.45 + Math.random() * 0.35,
            tw: 0.4 + Math.random() * 0.7,
            ph: Math.random() * 6.28,
            sx: 0,
            sy: 0,
            tx: 0,
            ty: 0,
            // Frozen preview draws a single frame: skip the staggered ignition (delay) and the
            // fade-in ramp so every star is already at steady twinkle in that one frame.
            t: staticMode ? 5 : 0,
            dur: 1.6 + Math.random() * 1.2,
            trail: [],
            life: 1,
            delay: staticMode ? 0 : Math.random() * 4,
          });
        }
        if (ents.length > ENT_CAP) ents.splice(0, ents.length - ENT_CAP);
        if (staticMode) drawOnce();
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointerdown', onDown);
      starsApi = null;
    };
  }, [enabled, staticMode]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-0 h-screen w-screen"
    />
  );
}
