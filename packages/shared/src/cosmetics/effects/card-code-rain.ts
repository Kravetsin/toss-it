import type { CardEffectModule, Surface } from '../types';
import { mountScene, sceneHash as hash, sceneLighten, sceneRgba } from '../canvas';

/**
 * Falling code. Two rules, and deliberately nothing else:
 *
 * 1. The glyphs never move. A column is a fixed stack of cells; what travels is a bright HEAD, and
 *    behind it a smooth trail of light revealing glyphs that were always sitting there, unlit.
 * 2. The head's position is CONTINUOUS (pixels, not rows), and a cell's brightness is a function of
 *    its distance behind the head. That is the whole trick: quantising the head to whole rows makes
 *    every column tick like a metronome. The glyphs stay put — the LIGHT is what has to be smooth.
 *    The head is split across the two cells it straddles, and that hand-off is what carries the
 *    motion, since the glyphs underneath cannot move to carry it themselves.
 *
 * Cells flip glyph in place on a shared tick, the old and new sharing the cell for that tick — the
 * shimmer of the grid. Two behaviours from the real effect were tried and dropped: a stammering head
 * (it has to move backwards, which breaks rule 2) and deletion streams (a hole that heals reads as
 * blinking). Being faithful to a reference matters less than the illusion holding.
 *
 * A stream runs from one trail-length above the card to one below it, so a trail drains THROUGH the
 * bottom edge instead of being cut off at it.
 *
 * COST: two baked glyph atlases per cell size (rebuilt only when the colour or size changes), and a
 * frame is one drawImage per LIT cell — the dark majority of the grid costs nothing.
 */

/** Half-width katakana, a han character, digits and marks — drawn mirrored, as the source set is. */
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌ日012345789Z*+:=.<>|';
const GREEN = '#31ff7a';
const TICK = 130; // ms a glyph holds before it may flip
const LOOP = 7800; // exactly 60 ticks, so the flip cadence survives the loop wrap

const atlases = new Map<string, HTMLCanvasElement>();
function atlas(cell: number, color: string): HTMLCanvasElement {
  const key = `${cell}|${color}`;
  const hit = atlases.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = cell * GLYPHS.length;
  c.height = cell;
  const ctx = c.getContext('2d')!;
  ctx.font = `${Math.round(cell * 0.88)}px ui-monospace, "MS Gothic", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  // Mirrored: it is what stops a set of real characters reading as plain text.
  ctx.translate(c.width, 0);
  ctx.scale(-1, 1);
  for (let i = 0; i < GLYPHS.length; i++) {
    ctx.fillText(GLYPHS[i]!, c.width - cell * (i + 0.5), cell * 0.52);
  }
  atlases.set(key, c);
  return c;
}

const halos = new Map<string, HTMLCanvasElement>();
/**
 * The head's halo, cached per colour. A two-stop gradient (which is what this was) puts its whole
 * falloff in one straight ramp, and a linear ramp has a readable edge — the head looked stamped on.
 * Stops weighted toward the centre give the same reach with no boundary. Cached rather than built per
 * head per frame: at ~80 columns on a chat row that was 80 gradients a frame for a decoration.
 */
function halo(color: string): HTMLCanvasElement {
  const hit = halos.get(color);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, sceneRgba(color, 0.5));
  g.addColorStop(0.22, sceneRgba(color, 0.26));
  g.addColorStop(0.5, sceneRgba(color, 0.09));
  g.addColorStop(0.78, sceneRgba(color, 0.02));
  g.addColorStop(1, sceneRgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 48, 48);
  halos.set(color, c);
  return c;
}

/** Which glyph a cell shows on a given tick — a pure function, so no grid is kept in memory. */
function glyphOf(col: number, row: number, tick: number): [number, boolean] {
  const seed = col * 131 + row * 17;
  const per = 2 + Math.floor(hash(seed, 7) * 4); // this cell flips every 2..5 ticks
  const off = Math.floor(hash(seed, 11) * per);
  const epoch = Math.floor((tick - off) / per);
  return [Math.floor(hash(seed + epoch * 977, 3) * GLYPHS.length), (tick - off) % per === 0];
}

function scene(base: string) {
  // The head is the chosen hue lightened, not a fixed white: a custom colour must still get a head
  // brighter than its own trail, and a hard white one would read as a different effect on top.
  const head = sceneLighten(base, 0.72);
  return (ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void => {
    // Cell size follows HEIGHT: a chat row must still get ~6 rows, or there is no column to fall down.
    const cell = Math.max(6, Math.min(13, h / 6));
    const cols = Math.ceil(w / cell) + 1;
    const rows = Math.ceil(h / cell);
    const tick = Math.floor(t / TICK);
    const fade = (t % TICK) / TICK;
    const body = atlas(cell, base);
    const bright = atlas(cell, head);

    ctx.globalCompositeOperation = 'lighter';
    for (let col = 0; col < cols; col++) {
      const trail = cell * (5 + hash(col, 1) * 11);
      const passes = 1 + Math.floor(hash(col, 2) * 3); // 1..3 streams per loop = per-column speed
      const f = ((t / (LOOP / passes) + hash(col, 4)) % 1) % 1;
      const headY = f * (h + trail * 2) - trail;
      const x = col * cell;
      const gain = 0.55 + hash(col, 6) * 0.45;

      const first = Math.max(0, Math.floor((headY - trail) / cell));
      const last = Math.min(rows - 1, Math.floor(headY / cell));
      for (let row = first; row <= last; row++) {
        const d = headY - (row + 0.5) * cell; // distance BEHIND the head, in px
        if (d < 0 || d > trail) continue;
        // Squared falloff: linear leaves a grey bar, the eye wants the light packed near the head.
        const a = (1 - d / trail) ** 2 * gain;
        if (a < 0.02) continue;
        const [gi, changing] = glyphOf(col, row, tick);
        const [pi] = glyphOf(col, row, tick - 1);
        const y = row * cell;
        if (changing && fade < 0.5) {
          // The half-and-half cross-fade on a flipping cell — one tick, only on cells that flip.
          ctx.globalAlpha = a * 0.5;
          ctx.drawImage(body, pi * cell, 0, cell, cell, x, y, cell, cell);
          ctx.drawImage(body, gi * cell, 0, cell, cell, x, y, cell, cell);
        } else {
          ctx.globalAlpha = a;
          ctx.drawImage(body, gi * cell, 0, cell, cell, x, y, cell, cell);
        }
      }

      const hr = headY / cell - 0.5;
      const lo = Math.floor(hr);
      for (const [row, weight] of [
        [lo, 1 - (hr - lo)],
        [lo + 1, hr - lo],
      ] as [number, number][]) {
        if (row < 0 || row >= rows || weight <= 0.01) continue;
        const [gi] = glyphOf(col, row, tick);
        ctx.globalAlpha = weight;
        ctx.drawImage(bright, gi * cell, 0, cell, cell, x, row * cell, cell, cell);
      }
      if (headY > -cell && headY < h + cell) {
        const r = cell * 1.5;
        ctx.globalAlpha = 0.9 * gain;
        ctx.drawImage(halo(head), x + cell / 2 - r, headY - r, r * 2, r * 2);
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
}

function render(
  layer: HTMLElement,
  _surface: Surface,
  _compact: boolean,
  color?: string,
): (() => void) | void {
  if (typeof document === 'undefined') return;
  return mountScene(layer, 'card-code-rain', scene(color || GREEN), {
    loopMs: LOOP,
    stillMs: 3400,
    maxLive: 8,
  });
}

export const cardCodeRain: CardEffectModule = {
  id: 'card-code-rain',
  type: 'card_effect',
  costDust: 5000,
  since: '2026-08-18',
  className: 'card-fx-code-rain',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  colorUpgrade: 'card-code-rain-color',
  labels: { name: 'shop.cardCodeRain', desc: 'shop.cardCodeRainDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
