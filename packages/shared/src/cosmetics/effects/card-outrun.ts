import type { CardEffectModule, Surface } from '../types';
import {
  mountScene,
  sceneHash as hash,
  sceneLighten,
  sceneRgb,
  sceneRgba as rgba,
} from '../canvas';

/**
 * Outrun: the synthwave drive. A car holds the lane ahead of a low camera while a neon grid
 * landscape streams past — striped sun on the horizon, its reflection shivering on the asphalt,
 * low-poly mountains flanking the road, tail lamps dragging two light trails.
 *
 * The scene is REAL perspective, not a drawing of one: a road point (X, Z) lands on screen as
 * x = cx + f·X/Z, y = horizon + f·(camY − H)/Z — one divide. Everything canonical falls out of
 * that: crossbars bunch toward the horizon (that is just 1/Z), mountains grow and part with true
 * parallax. The terrain is ONE height-field mesh, flat down the middle (that valley IS the road)
 * and noisy at the sides, the way the reference three.js scenes bake their displacement maps —
 * so the grid lines themselves climb over the ridges.
 *
 * Occlusion is painter's order over the field, and EVERY facet outside the road is filled, flat
 * valley floor included: gaps in the fill read as tears, and an unfilled far ridge is a ridge the
 * sun shines through. At the bottom the mesh is clipped to the NEAR PLANE properly — the row that
 * crosses it is interpolated at exactly Z=NEAR rather than dropped, or the nearest strip of
 * terrain vanishes a beat before it leaves the screen and the bottom edge flickers.
 *
 * Seamless by construction: SPEED·SECS/CELL_Z = 54 whole rows of baked heights per loop, the
 * noise lattice wraps at that period, and every oscillation (sway, bob, shimmer, twinkle) runs a
 * whole number of cycles per loop. The layout (focal length, road width, heights) derives from
 * the BOX: the near plane lands on the bottom edge and the road spans it, so a 40px chat row gets
 * the same widescreen vista, not a sliver of one.
 *
 * The DUAL upgrade sells the palette as one purchase: colour 1 is the NEON (grid, sky, sun body,
 * tail lamps), colour 2 the cool counterpoint (ridge lines, sun's top), with the mountains' dark
 * tones derived from colour 1 so the landscape stays one family. With no upgrade the authored
 * pink/cyan palette is used verbatim.
 *
 * COST: ~1700 calls a frame (the code rain's league) — the wireframe is built once per frame into
 * a Path2D and stroked three times for the neon. maxLive keeps the chat-overlay worst case sane.
 */

const LOOP = 9000;
const SECS = LOOP / 1000;
const TAU = Math.PI * 2;
const SPEED = 7.2;
const CELL_Z = 1.2;
const PERIOD = 54; // SPEED * SECS / CELL_Z — whole rows per loop, so the terrain comes round
const COLS = 10; // mesh columns each side of centre
const ROAD = 3; // of those, the flat ones — the road is a valley IN the terrain
const ROWS = 16;
const NEAR = 0.3;
const CAM_Y = 1;
const CAR_Z = 2.15;

interface Pal {
  sunTop: string;
  sunBot: string;
  grid: string;
  ridge: string;
  mt: string;
  sky: string;
  tail: string;
  body: string;
}
const DEFAULT_PAL: Pal = {
  sunTop: '#ffe15a',
  sunBot: '#ff2e88',
  grid: '#ff4fd8',
  ridge: '#35e6ff',
  mt: '#2a1b4d',
  sky: '#ff2e88',
  tail: '#ff2e5a',
  body: '#1a1030',
};

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function darkHex(hex: string, f: number): string {
  const [r, g, b] = sceneRgb(hex);
  const c = (v: number) =>
    Math.max(8, Math.round(v * f))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mixCss(h1: string, h2: string, t: number): string {
  const a = sceneRgb(h1);
  const b = sceneRgb(h2);
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
function derivePal(c1: string, c2: string): Pal {
  return {
    grid: c1,
    sky: c1,
    sunBot: c1,
    tail: c1,
    ridge: c2,
    sunTop: sceneLighten(c2, 0.4),
    mt: darkHex(c1, 0.24),
    body: darkHex(c1, 0.11),
  };
}

/** Value noise on a lattice that WRAPS in the row direction: periodic terrain, closed loop. */
function vnoise(x: number, y: number, yPeriod: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const wrap = (n: number) => ((n % yPeriod) + yPeriod) % yPeriod;
  const H = (a: number, b: number) => hash(a * 57.3 + wrap(b) * 131.7, seed);
  return lerp(lerp(H(xi, yi), H(xi + 1, yi), u), lerp(H(xi, yi + 1), H(xi + 1, yi + 1), u), v);
}

interface Layout {
  horizonY: number;
  drop: number;
  f: number;
  roadHalf: number;
  cellX: number;
  sunR: number;
  H: Float64Array[];
  stars: [number, number, number, number][];
}
const layouts = new Map<string, Layout>();

function layoutFor(w: number, h: number): Layout {
  const key = `${w}x${h}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const horizonY = Math.round(h * 0.44);
  const drop = h - horizonY;
  // Focal length so the near plane lands on the bottom edge; road width so it spans the box
  // there — the genre's violent splay, derived from the box instead of tuned per size.
  const f = (drop * 0.55) / CAM_Y;
  const roadHalf = (w * 0.5 * 0.95) / drop;
  const H: Float64Array[] = [];
  for (let wr = 0; wr < PERIOD; wr++) {
    const row = new Float64Array(COLS * 2 + 1);
    for (let i = -COLS; i <= COLS; i++) {
      const a = Math.max(0, Math.abs(i) - ROAD) / (COLS - ROAD);
      const ramp = Math.pow(a, 1.35) * 11;
      const n1 = vnoise(i * 0.45, wr / 3, PERIOD / 3, 5);
      const n2 = vnoise(i * 0.9, wr / 2, PERIOD / 2, 12);
      row[i + COLS] = ramp * (0.62 * n1 + 0.38 * n2 + 0.1);
    }
    H.push(row);
  }
  const stars: Layout['stars'] = [];
  for (let i = 0; i < 30; i++) {
    stars.push([
      hash(i, 61) * w,
      hash(i, 62) * horizonY * 0.95,
      0.4 + hash(i, 63) * 1.1,
      hash(i, 64) * TAU,
    ]);
  }
  const built: Layout = {
    horizonY,
    drop,
    f,
    roadHalf,
    cellX: roadHalf / ROAD,
    sunR: Math.max(7, Math.min(h * 0.3, w * 0.13)),
    H,
    stars,
  };
  if (layouts.size > 12) layouts.clear();
  layouts.set(key, built);
  return built;
}

function neonPath(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  color: string,
  coreW: number,
  glowW: number,
  a: number,
): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgba(color, 0.14 * a);
  ctx.lineWidth = glowW;
  ctx.stroke(path);
  ctx.strokeStyle = rgba(color, 0.7 * a);
  ctx.lineWidth = coreW * 2;
  ctx.stroke(path);
  ctx.strokeStyle = `rgba(255,255,255,${0.62 * a})`;
  ctx.lineWidth = coreW;
  ctx.stroke(path);
}
function spill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  a: number,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, 0.32 * a));
  g.addColorStop(0.45, rgba(color, 0.12 * a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function scene(pal: Pal) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void => {
    const ts = t / 1000;
    const L = layoutFor(w, h);
    const { horizonY, f, roadHalf, cellX, sunR } = L;
    const cx = w / 2;
    const travelled = ts * SPEED;
    const yAt = (Z: number) => horizonY + (f * CAM_Y) / Z;
    const xAt = (X: number, Z: number) => cx + (f * X) / Z;
    const proj = (i: number, Z: number, hh: number): [number, number] => [
      xAt(i * cellX, Z),
      horizonY + (f * (CAM_Y - hh)) / Z,
    ];

    // 1. Sky: a band of heat at the horizon (the card must stay readable), twinkling stars.
    const skyG = ctx.createLinearGradient(0, horizonY - sunR * 2.4, 0, horizonY);
    skyG.addColorStop(0, rgba(pal.sky, 0));
    skyG.addColorStop(1, rgba(pal.sky, 0.16));
    ctx.fillStyle = skyG;
    ctx.fillRect(0, horizonY - sunR * 2.4, w, sunR * 2.4);
    for (const st of L.stars) {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((TAU * 3 * ts) / SECS + st[3]));
      ctx.fillStyle = `rgba(232,240,255,${(0.5 * tw * (1 - st[1] / horizonY)).toFixed(3)})`;
      ctx.fillRect(st[0], st[1], st[2], st[2]);
    }

    // 2. The striped sun: bars thicker and further apart toward the bottom, plus its reflection
    // shivering on the road (whole shimmer cycles per loop, like everything else).
    const sunCY = horizonY - sunR * 0.22;
    spill(ctx, cx, sunCY, sunR * 3.2, pal.sunBot, 0.9);
    let y = -sunR;
    while (y < sunR) {
      const barH = Math.max(1, sunR * (0.05 + 0.1 * ((y + sunR) / (2 * sunR))));
      const half = Math.sqrt(Math.max(0, sunR * sunR - y * y));
      if (half > 0.5) {
        ctx.fillStyle = mixCss(pal.sunTop, pal.sunBot, clamp((y + sunR) / (2 * sunR), 0, 1));
        ctx.fillRect(cx - half, sunCY + y, half * 2, barH);
      }
      y += barH + sunR * (0.012 + 0.11 * clamp((y + sunR) / (2 * sunR), 0, 1));
    }
    const refG = ctx.createLinearGradient(0, horizonY, 0, h);
    refG.addColorStop(0, rgba(pal.sunBot, 0.22));
    refG.addColorStop(1, rgba(pal.sunBot, 0));
    ctx.fillStyle = refG;
    const shimmer = 0.9 + 0.06 * Math.sin((TAU * 5 * ts) / SECS);
    ctx.fillRect(cx - sunR * shimmer, horizonY, sunR * 2 * shimmer, h - horizonY);

    // 3. The terrain mesh (see the header for why it is one field, filled everywhere but the
    // road, and clipped — not culled — at the near plane).
    const phase = travelled % CELL_Z;
    const baseRow = Math.floor(travelled / CELL_Z);
    interface Row {
      Z: number;
      hr: Float64Array;
      pts: [number, number][] | null;
      fade: number;
    }
    const rows: Row[] = [];
    for (let n = 0; n <= ROWS; n++) {
      const Z = n * CELL_Z - phase;
      const hr = L.H[(((n + baseRow) % PERIOD) + PERIOD) % PERIOD]!;
      const r: Row = { Z, hr, pts: null, fade: clamp(1 - Z / 30, 0.12, 1) };
      if (Z >= NEAR) {
        r.pts = new Array(COLS * 2 + 1);
        for (let i = -COLS; i <= COLS; i++) r.pts[i + COLS] = proj(i, Z, hr[i + COLS]!);
      }
      rows.push(r);
    }
    let synth: { pts: [number, number][]; hr: Float64Array } | null = null;
    for (let n = 0; n < ROWS; n++) {
      const A = rows[n]!;
      const B = rows[n + 1]!;
      if (A.Z < NEAR && B.Z >= NEAR) {
        const tc = (NEAR - A.Z) / (B.Z - A.Z);
        const hr = new Float64Array(COLS * 2 + 1);
        const pts: [number, number][] = new Array(COLS * 2 + 1);
        for (let i = 0; i <= COLS * 2; i++) {
          hr[i] = lerp(A.hr[i]!, B.hr[i]!, tc);
          pts[i] = proj(i - COLS, NEAR, hr[i]!);
        }
        synth = { pts, hr };
        break;
      }
    }
    for (let n = ROWS - 1; n >= 0; n--) {
      const B = rows[n + 1]!;
      if (!B.pts) continue;
      const A = rows[n]!;
      const Apts = A.pts ?? synth?.pts;
      const Ahr = A.pts ? A.hr : synth?.hr;
      if (!Apts || !Ahr) continue;
      const fade = A.pts ? A.fade : 1;
      for (let i = 0; i < COLS * 2; i++) {
        if (i >= COLS - ROAD && i < COLS + ROAD) continue;
        const side = i < COLS ? -1 : 1;
        // Facets tilted toward the middle catch the sun; the ones turned away go dark.
        const shade = clamp(0.5 + ((Ahr[i + 1]! - Ahr[i]!) * side) / 4, 0.18, 1);
        ctx.fillStyle = rgba(pal.mt, (0.45 + shade * 0.5) * fade);
        ctx.beginPath();
        ctx.moveTo(Apts[i]![0], Apts[i]![1]);
        ctx.lineTo(Apts[i + 1]![0], Apts[i + 1]![1]);
        ctx.lineTo(B.pts[i + 1]![0], B.pts[i + 1]![1]);
        ctx.lineTo(B.pts[i]![0], B.pts[i]![1]);
        ctx.closePath();
        ctx.fill();
      }
    }
    const hor = new Path2D();
    hor.moveTo(0, horizonY);
    hor.lineTo(w, horizonY);
    neonPath(ctx, hor, pal.grid, 1, 7, 0.45);
    for (const [r0, r1, a] of [
      [7, ROWS, 0.4],
      [0, 7, 0.9],
    ] as const) {
      for (const road of [true, false]) {
        const from = road ? COLS - ROAD : 0;
        const to = road ? COLS + ROAD : COLS * 2;
        const inRoad = (i: number) => !road && i > COLS - ROAD && i < COLS + ROAD;
        const p = new Path2D();
        for (let n = r0; n <= r1; n++) {
          const R = rows[n]!;
          if (!R.pts) continue;
          let open = false;
          for (let i = from; i <= to; i++) {
            if (inRoad(i)) {
              open = false;
              continue;
            }
            if (!open) {
              p.moveTo(R.pts[i]![0], R.pts[i]![1]);
              open = true;
            } else p.lineTo(R.pts[i]![0], R.pts[i]![1]);
          }
        }
        for (let i = from; i <= to; i++) {
          if (inRoad(i)) continue;
          let open = false;
          // The near band's rails run to the clipped near edge, not to the last surviving row.
          if (r0 === 0 && synth) {
            p.moveTo(synth.pts[i]![0], synth.pts[i]![1]);
            open = true;
          }
          for (let n = r0; n <= r1; n++) {
            const R = rows[n]!;
            if (!R.pts) continue;
            if (!open) {
              p.moveTo(R.pts[i]![0], R.pts[i]![1]);
              open = true;
            } else p.lineTo(R.pts[i]![0], R.pts[i]![1]);
          }
        }
        neonPath(
          ctx,
          p,
          road ? pal.grid : pal.ridge,
          road ? 0.9 : 0.7,
          road ? 5 : 4,
          a * (road ? 1 : 0.85),
        );
      }
    }

    // 4. The car: fixed depth, swaying across the lanes and bobbing on its suspension — two
    // harmonics each, all whole cycles per loop.
    const sway =
      Math.sin((TAU * 2 * ts) / SECS) * 0.55 + Math.sin((TAU * 3 * ts) / SECS + 1.1) * 0.2;
    const carX = cx + (f * (sway * roadHalf * 0.34)) / CAR_Z;
    const bob = Math.sin((TAU * 12 * ts) / SECS) * 0.6 + Math.sin((TAU * 19 * ts) / SECS) * 0.35;
    const groundY = yAt(CAR_Z) + bob;
    const CW = clamp(Math.min(h * 0.5, w * 0.15), 16, 74);
    const CH = CW * 0.44;

    for (const sgn of [-1, 1]) {
      const tx = carX + sgn * CW * 0.34;
      const g = ctx.createLinearGradient(tx, groundY, tx, h);
      g.addColorStop(0, rgba(pal.tail, 0.5));
      g.addColorStop(1, rgba(pal.tail, 0));
      ctx.fillStyle = g;
      ctx.fillRect(tx - CW * 0.05, groundY, CW * 0.1, h - groundY);
    }
    spill(ctx, carX, groundY, CW * 1.1, pal.tail, 0.8);

    ctx.save();
    ctx.translate(carX, groundY);
    ctx.rotate(sway * 0.05);
    ctx.fillStyle = 'rgba(8,6,14,0.95)';
    for (const sgn of [-1, 1]) {
      ctx.fillRect(sgn * CW * 0.5 - (sgn > 0 ? CW * 0.16 : 0), -CH * 0.42, CW * 0.16, CH * 0.42);
    }
    const bodyG = ctx.createLinearGradient(0, -CH, 0, 0);
    bodyG.addColorStop(0, mixCss(pal.body, pal.grid, 0.35));
    bodyG.addColorStop(1, pal.body);
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.moveTo(-CW * 0.5, 0);
    ctx.lineTo(-CW * 0.44, -CH * 0.62);
    ctx.lineTo(CW * 0.44, -CH * 0.62);
    ctx.lineTo(CW * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-CW * 0.34, -CH * 0.62);
    ctx.lineTo(-CW * 0.26, -CH * 1.02);
    ctx.lineTo(CW * 0.26, -CH * 1.02);
    ctx.lineTo(CW * 0.34, -CH * 0.62);
    ctx.closePath();
    ctx.fill();
    const winG = ctx.createLinearGradient(0, -CH, 0, -CH * 0.66);
    winG.addColorStop(0, rgba(pal.ridge, 0.5));
    winG.addColorStop(1, rgba(pal.ridge, 0.12));
    ctx.fillStyle = winG;
    ctx.fillRect(-CW * 0.24, -CH * 0.98, CW * 0.48, CH * 0.3);
    ctx.fillStyle = rgba(pal.ridge, 0.55);
    ctx.fillRect(-CW * 0.46, -CH * 0.68, CW * 0.92, Math.max(1, CH * 0.06));
    // Tail lamps: the one detail that has to be unmistakable at 40px.
    for (const sgn of [-1, 1]) {
      const lx = sgn * CW * 0.34;
      ctx.fillStyle = rgba(pal.tail, 0.95);
      ctx.fillRect(lx - CW * 0.11, -CH * 0.5, CW * 0.22, Math.max(1.4, CH * 0.16));
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(lx - CW * 0.05, -CH * 0.47, CW * 0.1, Math.max(1, CH * 0.08));
    }
    ctx.restore();
    for (const sgn of [-1, 1]) {
      spill(ctx, carX + sgn * CW * 0.34, groundY - CH * 0.42, CW * 0.5, pal.tail, 1);
    }
  };
}

function render(
  layer: HTMLElement,
  _surface: Surface,
  _compact: boolean,
  color?: string,
  color2?: string,
): (() => void) | void {
  if (typeof document === 'undefined') return;
  const pal =
    color || color2
      ? derivePal(color || DEFAULT_PAL.grid, color2 || DEFAULT_PAL.ridge)
      : DEFAULT_PAL;
  return mountScene(layer, 'card-outrun', scene(pal), { loopMs: LOOP, stillMs: 2100, maxLive: 6 });
}

export const cardOutrun: CardEffectModule = {
  id: 'card-outrun',
  type: 'card_effect',
  costDust: 6000,
  since: '2026-08-28',
  className: 'card-fx-outrun',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  colorUpgrade: 'card-outrun-color',
  dualColor: true,
  labels: { name: 'shop.cardOutrun', desc: 'shop.cardOutrunDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
