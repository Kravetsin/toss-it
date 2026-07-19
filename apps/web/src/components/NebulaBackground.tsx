import { useEffect, useRef } from 'react';
import { useFidgetEnabled } from '@/hooks/useFidgetEnabled';

/**
 * PROTOTYPE — a barred-spiral galaxy on the viewer page background, reusing the portal's tinted glow
 * sprite (see cosmetics/effects/entrance-portal). Modelled on the Milky Way's top-down shape:
 * an elongated central BAR/bulge, with the arms starting at the bar's TIPS and winding outward as a
 * LOG spiral (tight near the centre, opening at the rim). Arms never reach r=0, so they emerge from
 * the bulge instead of plunging into it — the "strange entry into the glow" of the first pass.
 *
 * The portal DRAINS inward (a wormhole); a page background must not — a persistent inward pull reads
 * as unease. So the disc only rotates very slowly and twinkles: a living galaxy, not a drain.
 *
 * The channel page shows it once the channel has earned it (NEBULA_MIN_PLAYED aired submissions) and
 * the streamer hasn't hidden it. `fill="parent"` renders it into a sized box instead of the viewport —
 * used for the small showcase on the dashboard's Achievements page.
 */

const DEFAULT_COLOR = '#8df0cc';
const R_IN = 0.17; // arms start here (the bar tips); inside is the bulge — keeps the core clear
const SPIRAL = 6; // log-spiral winding: higher = more turns from bar to rim
// Two dominant arms from opposite bar tips (base 0 and π lie along the bar axis), plus two fainter
// spurs offset from them — the Milky Way reads as two-armed with minor spurs, not a clean pinwheel.
const ARMS = [
  { base: 0, w: 1 },
  { base: Math.PI, w: 1 },
  { base: 0.6, w: 0.5 },
  { base: Math.PI + 0.6, w: 0.5 },
];

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

interface Star {
  r: number; // normalized radius 0 (centre) … 1 (rim)
  theta: number; // angular position on its arm in the disc's own frame (rotation is added per frame)
  tw: number; // twinkle frequency
  ph: number; // twinkle phase
  sz: number; // base sprite size
  knot: boolean; // a star-forming clump — bigger and brighter, so arms read as beaded, not smooth
  bulge: boolean; // part of the central bar: lives inside R_IN, skips the arm rim-fade
}

// Triangular distribution in [-1,1], peaked at 0 — packs stars toward the arm centreline (arm thickness).
function spread(): number {
  return Math.random() + Math.random() - 1;
}

function buildStars(n: number): Star[] {
  const wTotal = ARMS.reduce((s, a) => s + a.w, 0);
  const out: Star[] = [];
  for (let i = 0; i < n; i++) {
    // ~14% diffuse halo/bulge stars scattered off the arms; the rest ride an arm.
    if (Math.random() < 0.14) {
      const r = Math.pow(Math.random(), 0.5) * 0.95;
      out.push({
        r,
        theta: Math.random() * Math.PI * 2,
        tw: 0.4 + Math.random() * 0.8,
        ph: Math.random() * 6.28,
        sz: 1.6 + Math.random() * 2.4,
        knot: false,
        bulge: false,
      });
      continue;
    }
    // Pick an arm by weight.
    let pick = Math.random() * wTotal;
    let arm = ARMS[0]!;
    for (const a of ARMS) {
      if ((pick -= a.w) <= 0) {
        arm = a;
        break;
      }
    }
    // Radius biased slightly outward; arms live between the bar tip (R_IN) and the rim.
    const r = R_IN + (1 - R_IN) * Math.pow(Math.random(), 0.7);
    // Log spiral: angle grows with ln(r) → tight near the bar, opening outward. Scatter widens with
    // radius so arms are crisp near the core and feather out at the rim.
    const theta = arm.base + SPIRAL * Math.log(r / R_IN) + spread() * (0.12 + 0.5 * r);
    const knot = Math.random() < 0.07;
    out.push({
      r,
      theta,
      tw: 0.4 + Math.random() * 0.8,
      ph: Math.random() * 6.28,
      sz: knot ? 4 + Math.random() * 3 : 2 + Math.random() * 3,
      knot,
      bulge: false,
    });
  }
  // The BAR: a dense, elongated cloud of small stars along the disc's axis. The bar reads from this
  // DENSITY, not a gradient oval — the portal taught us a blurred blob is the weakest thing on screen.
  // Built in disc-frame cartesian (u along the bar, w across it) then converted to the same (r, theta)
  // the render loop already rotates, so bar and arm tips stay locked to one axis.
  const bulge = Math.round(n * 0.22);
  for (let i = 0; i < bulge; i++) {
    const u = spread() * 0.19; // long axis
    const w = spread() * 0.05; // thin across
    out.push({
      r: Math.hypot(u, w),
      theta: Math.atan2(w, u),
      tw: 0.5 + Math.random() * 0.9,
      ph: Math.random() * 6.28,
      sz: 1.1 + Math.random() * 1.6,
      knot: false,
      bulge: true,
    });
  }
  return out;
}

/**
 * @param color  #rrggbb tint (cosmetic-independent; defaults to brand mint, NOT the channel accent).
 * @param cx,cy  centre as a fraction of the viewport — default sits a little above centre, near the
 *               submit area, without pinning to any element.
 */
export function NebulaBackground({
  color = DEFAULT_COLOR,
  cx = 0.5,
  cy = 0.42,
  fill = 'viewport',
}: {
  color?: string;
  cx?: number;
  cy?: number;
  /** 'viewport' = fixed full-screen page background; 'parent' = fill a sized `relative` box (preview). */
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
    const [lr, lg, lb] = [hr, hg, hb].map((v) => Math.round(v + (255 - v) * 0.6)) as [
      number,
      number,
      number,
    ];
    // Density scales with viewport width so the wider disc (below) doesn't thin out on big monitors.
    const stars = buildStars(Math.min(1300, Math.max(560, Math.round(window.innerWidth * 0.7))));
    let W = 0;
    let H = 0;
    let raf = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Fall back to the viewport only for the page background. The preview must wait for a real
      // measurement — a 0-height first paint would otherwise lock its backing store to the viewport.
      const w = rect.width || (fill === 'viewport' ? window.innerWidth : 0);
      const h = rect.height || (fill === 'viewport' ? window.innerHeight : 0);
      if (w < 1 || h < 1) return; // not laid out yet; the ResizeObserver fires again once it is
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
      // A tilted disc: wider than tall so it reads as a galaxy seen at an angle, not a flat ring.
      // Scaled to the full viewport width (arms overrun both edges) so the sides aren't left empty.
      const RX = W * 0.62;
      const RY = RX * 0.66;
      const rot = now * 0.00004; // the whole disc (bar + arms) turns, very slowly and rigidly

      // Faint gas haze — a couple of broad, low-alpha clouds so the disc has body between the arms.
      ctx.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 2; k++) {
        const oa = rot * 1.3 + k * Math.PI;
        const gx = centreX + Math.cos(oa) * RX * 0.3;
        const gy = centreY + Math.sin(oa) * RY * 0.3;
        const gr = RX * 0.7;
        const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
        g.addColorStop(0, `rgba(${hr},${hg},${hb},0.045)`);
        g.addColorStop(1, `rgba(${hr},${hg},${hb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, 6.2832);
        ctx.fill();
      }

      // One star, added as light. Split into far/near passes around the core (below) for occlusion.
      const drawBody = (st: Star, ang: number) => {
        const x = centreX + Math.cos(ang) * RX * st.r;
        const y = centreY + Math.sin(ang) * RY * st.r;
        const tw = 0.68 + 0.32 * Math.sin(now * 0.001 * st.tw + st.ph);
        const size = st.sz * (0.85 + 0.5 * (1 - st.r));
        // Bar stars live inside R_IN and skip the rim-fade; arm stars emerge softly from the bar
        // (fade in just past R_IN) and feather out at the rim.
        const fade = st.bulge
          ? 1
          : Math.min(1, (st.r - R_IN) / 0.06) * Math.min(1, (1 - st.r) / 0.24);
        const base = st.bulge ? 0.6 : st.knot ? 0.85 : 0.4 + 0.45 * (1 - st.r);
        ctx.globalAlpha = Math.min(1, base * tw * Math.max(0, fade));
        ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
      };

      // The disc is tilted (RY < RX), so sin(ang) is the depth cue: the upper half (sin < 0) recedes
      // BEHIND the mid-plane, the lower half comes toward us. Draw the far half first, then the opaque
      // core over it, then the near half — a painter's-algorithm occlusion so the core really hides the
      // stars behind it (not just washes them out).
      ctx.globalCompositeOperation = 'lighter';
      for (const st of stars) {
        const ang = st.theta + rot;
        if (Math.sin(ang) < 0) drawBody(st, ang);
      }

      // The central mass everything orbits — a TRUE CIRCLE in screen space (arc in px, NOT scaled by
      // the disc), so it stays round at any tilt. Built as two things, not the old three-zone blur:
      //  (a) the LIGHT it casts — a soft, wide, additive halo that reaches well beyond the body;
      //  (b) the STAR itself — two OPAQUE layers (white-hot core → colour mantle), source-over so it
      //      genuinely occludes the far-side stars behind it (no semi-transparent "bubble" in between).
      const Rstar = RX * 0.008;
      const Rglow = RX * 0.31;
      const glow = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, Rglow);
      glow.addColorStop(0, `rgba(${lr},${lg},${lb},0.4)`);
      glow.addColorStop(0.35, `rgba(${hr},${hg},${hb},0.16)`);
      glow.addColorStop(1, `rgba(${hr},${hg},${hb},0)`);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(centreX, centreY, Rglow, 0, 6.2832);
      ctx.fill();

      const body = ctx.createRadialGradient(centreX, centreY, 0, centreX, centreY, Rstar);
      body.addColorStop(0, 'rgba(255,255,255,1)'); // dense core
      body.addColorStop(0.55, `rgba(${lr},${lg},${lb},1)`); // colour mantle — still fully opaque
      body.addColorStop(0.9, `rgba(${hr},${hg},${hb},1)`);
      body.addColorStop(1, `rgba(${hr},${hg},${hb},0)`); // 10% limb feather, just anti-aliasing
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(centreX, centreY, Rstar, 0, 6.2832);
      ctx.fill();

      // The near half, in front of the core.
      ctx.globalCompositeOperation = 'lighter';
      for (const st of stars) {
        const ang = st.theta + rot;
        if (Math.sin(ang) >= 0) drawBody(st, ang);
      }

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
  }, [enabled, color, cx, cy]);

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
