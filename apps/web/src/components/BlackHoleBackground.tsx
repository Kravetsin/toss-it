import { useEffect, useRef } from 'react';
import { useFidgetEnabled } from '@/hooks/useFidgetEnabled';

/**
 * A black hole on the viewer page background — the darker sibling of the galaxy (NebulaBackground),
 * earned at a higher milestone. Reuses the portal's tinted glow sprite and inward-spiral math, but
 * simpler: no bar/arms/star. Matter streams in along a spiral accretion disc and is SWALLOWED by an
 * opaque black sphere at the centre (painter's algorithm: particles are drawn first, the black core
 * over them — so whatever reached the centre simply vanishes, exactly the "eaten" read we want). A
 * thin photon ring rims the horizon so the sphere doesn't disappear on a dark stream.
 *
 * `fill="parent"` renders it into a sized box (the Achievements showcase) instead of the viewport.
 */

const DEFAULT_COLOR = '#8df0cc';
const WIND = 1; // spiral turns on the way in
const ARMS = 2; // faint over-density every half-turn, so the inflow reads as a disc, not a smear

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]! : h;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** White-hot core → light tint → colour, fading out — same recipe as the portal's spark sprite. */
function makeSprite(color: string): HTMLCanvasElement {
  const [r, g, b] = hexToRgb(color);
  const lr = Math.round(r + (255 - r) * 0.6);
  const lg = Math.round(g + (255 - g) * 0.6);
  const lb = Math.round(b + (255 - b) * 0.6);
  const s = document.createElement('canvas');
  s.width = s.height = 32;
  const c = s.getContext('2d')!;
  const grad = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, `rgba(${lr},${lg},${lb},0.95)`);
  grad.addColorStop(0.75, `rgba(${r},${g},${b},0.4)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  c.fillStyle = grad;
  c.fillRect(0, 0, 32, 32);
  return s;
}

interface Mote {
  a0: number; // angle where it enters the disc
  ph0: number; // staggered so motes sit at every depth of the inward journey at once
  speed: number; // how fast it falls in (per ms)
  tw: number; // twinkle frequency
  ph: number; // twinkle phase
  sz: number; // base size
}

function buildMotes(n: number): Mote[] {
  const out: Mote[] = [];
  for (let i = 0; i < n; i++) {
    // Snap the entry angle loosely to an arm so the inflow has structure, with scatter so it's soft.
    const arm = (Math.floor(Math.random() * ARMS) / ARMS) * Math.PI * 2;
    out.push({
      a0: arm + (Math.random() - 0.5) * 1.6,
      ph0: Math.random(),
      speed: 0.00001 + Math.random() * 0.00001, // faster than the galaxy's drift — matter is falling in
      tw: 0.4 + Math.random() * 0.8,
      ph: Math.random() * 6.28,
      sz: 2.6 + Math.random() * 2.6,
    });
  }
  return out;
}

/**
 * @param color  #rrggbb tint (cosmetic-independent; defaults to brand mint, NOT the channel accent).
 * @param cx,cy  centre as a fraction of the viewport.
 * @param fill   'viewport' = fixed full-screen background; 'parent' = fill a sized `relative` box.
 */
export function BlackHoleBackground({
  color = DEFAULT_COLOR,
  cx = 0.5,
  cy = 0.42,
  fill = 'viewport',
}: {
  color?: string;
  cx?: number;
  cy?: number;
  fill?: 'viewport' | 'parent';
}) {
  const enabled = useFidgetEnabled();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_COLOR;
    const sprite = makeSprite(safe);
    const [hr, hg, hb] = hexToRgb(safe);
    const motes = buildMotes(Math.min(1100, Math.max(480, Math.round(window.innerWidth * 0.6))));
    let W = 0;
    let H = 0;
    let raf = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width || (fill === 'viewport' ? window.innerWidth : 0);
      const h = rect.height || (fill === 'viewport' ? window.innerHeight : 0);
      if (w < 1 || h < 1) return;
      W = w;
      H = h;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (now: number) => {
      ctx.clearRect(0, 0, W, H);
      const centreX = W * cx;
      const centreY = H * cy;
      // A tilted accretion disc: wider than tall, seen at an angle.
      const RX = W * 0.6;
      const RY = RX * 0.3;
      const rCoreN = 0.09; // horizon radius as a fraction of RX; motes vanish inside it
      const rot = now * 0.00003; // the whole disc shears round, faster than the galaxy

      // 1) The accretion inflow, added as light. A mote spirals from the rim down to the horizon.
      ctx.globalCompositeOperation = 'lighter';
      for (const m of motes) {
        const ph = (((m.ph0 + now * m.speed) % 1) + 1) % 1; // 0 at the rim … 1 at the horizon
        // Accelerate inward (ph^1.6) — matter whips up as it falls in — and wind tighter near the hole.
        const rN = rCoreN + (1 - rCoreN) * (1 - Math.pow(ph, 0.8));
        const ang = m.a0 + rot + WIND * ph * Math.PI * 2;
        const x = centreX + Math.cos(ang) * RX * rN;
        const y = centreY + Math.sin(ang) * RY * rN;
        // Fade in at the rim, brightest mid-fall, then dim just before the black core eats it.
        const fade = Math.min(1, ph / 0.08) * Math.min(1, (1 - ph) / 0.14);
        const tw = 0.65 + 0.35 * Math.sin(now * 0.001 * m.tw + m.ph);
        const size = m.sz * (0.7 + 0.9 * ph); // compresses brighter/bigger as it nears the horizon
        ctx.globalAlpha = Math.min(1, (1.3 + 0.55 * ph) * fade * tw);
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      }

      // 2) The event-horizon glow — a bright thin ring rimming the sphere (drawn as light, before the
      //    black fill so the fill's edge bites into it and the ring hugs the horizon).
      const Rcore = RX * rCoreN;
      ctx.globalCompositeOperation = 'lighter';
      const ring = ctx.createRadialGradient(
        centreX,
        centreY,
        Rcore * 0.7,
        centreX,
        centreY,
        Rcore * 1.5,
      );
      ring.addColorStop(0, `rgba(${hr},${hg},${hb},0)`);
      ring.addColorStop(0.15, `rgba(${hr},${hg},${hb},0.2)`);
      ring.addColorStop(1, `rgba(${hr},${hg},${hb},0)`);
      ctx.globalAlpha = 1;
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(centreX, centreY, Rcore * 1.5, 0, 6.2832);
      ctx.fill();

      // 3) The devouring sphere: an opaque black core (source-over) over everything, so motes that
      //    reached the centre are simply covered — swallowed. A TRUE CIRCLE (arc in px), round at any
      //    disc tilt. Darker than the page, so it reads as a hole punched in space.
      const core = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, Rcore);
      core.addColorStop(0, 'rgba(0,0,0,1)');
      core.addColorStop(0.72, 'rgba(0,0,0,1)'); // opaque plateau — this is what eats the motes
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(centreX, centreY, Rcore, 0, 6.2832);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [enabled, color, cx, cy, fill]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={
        fill === 'parent'
          ? 'pointer-events-none absolute inset-0 h-full w-full'
          : 'pointer-events-none fixed left-0 top-0 z-0 h-screen w-screen'
      }
    />
  );
}
