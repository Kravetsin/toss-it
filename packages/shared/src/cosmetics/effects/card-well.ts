import type { CardEffectModule } from '../types';
import { mountScene, sceneHash as hash, sceneRgba as rgba } from '../canvas';

/**
 * The well is the WHOLE card: the column grid is derived from the box, so the pieces fall
 * edge to edge at any size and the card's own sides are the walls. The tiling is generated, not
 * authored: the bottom two rows are cut into chunks of 2 and 4 columns, each chunk filled by pieces
 * that tile it exactly, so the rows always come out full — and because a full clear leaves an empty
 * well, the loop closes on itself with nothing to reset.
 *
 * The piece count follows the width, and the drop cadence follows the piece count: a card gets five
 * calm drops, a chat row gets twenty overlapping ones and reads as a curtain. Same scene, and neither
 * size is the one it was tuned for.
 */

const LOOP = 6400;
const FILL = 4400;
const FALL = 560;
const CLEAR = 5150;
const I = '#4ad9ff';
const O = '#ffe14a';
const L = '#ffab3d';
const J = '#6a8dff';

/** 0..1 progress of `t` through a window, clamped. */
function span(t: number, from: number, to: number): number {
  const v = (t - from) / (to - from);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
/** Gravity feel on a drop: accelerating, never eased out — a piece does not float down. */
const easeIn = (t: number): number => t * t * t;

let sparkSprite: HTMLCanvasElement | undefined;
/** Soft white spark, cached — the clear throws one per column and a gradient per spark is wasteful. */
function blob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  if (!sparkSprite) {
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 48, 48);
    sparkSprite = c;
  }
  ctx.globalAlpha = a;
  ctx.drawImage(sparkSprite, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}

interface Piece {
  color: string;
  cells: [number, number][];
}

/** Cut `cols` (always even) into chunks and fill each with pieces that tile it exactly. */
function build(cols: number): Piece[] {
  const chunks: Piece[][] = [];
  let c = 0;
  while (c < cols) {
    const four = cols - c >= 4 && hash(c, 21) < 0.62;
    if (!four) {
      chunks.push([
        {
          color: O,
          cells: [
            [c, 0],
            [c + 1, 0],
            [c, 1],
            [c + 1, 1],
          ],
        },
      ]);
      c += 2;
      continue;
    }
    if (hash(c, 22) < 0.5) {
      chunks.push([
        {
          color: I,
          cells: [
            [c, 0],
            [c + 1, 0],
            [c + 2, 0],
            [c + 3, 0],
          ],
        },
        {
          color: I,
          cells: [
            [c, 1],
            [c + 1, 1],
            [c + 2, 1],
            [c + 3, 1],
          ],
        },
      ]);
    } else {
      // L and J interlocked: three across the floor plus one riser, then its mirror on top.
      chunks.push([
        {
          color: L,
          cells: [
            [c, 0],
            [c + 1, 0],
            [c + 2, 0],
            [c, 1],
          ],
        },
        {
          color: J,
          cells: [
            [c + 3, 0],
            [c + 1, 1],
            [c + 2, 1],
            [c + 3, 1],
          ],
        },
      ]);
    }
    c += 4;
  }
  // Chunks never share a column, so any order between them is physically valid — shuffling them is
  // what stops the fill reading as a left-to-right wipe.
  return chunks
    .map((p, i) => ({ p, k: hash(i, 31) }))
    .sort((a, b) => a.k - b.k)
    .flatMap((x) => x.p);
}

function block(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  color: string,
  a: number,
): void {
  const p = Math.max(0.5, s * 0.08);
  ctx.fillStyle = rgba(color, 0.26 * a);
  ctx.fillRect(x + p, y + p, s - p * 2, s - p * 2);
  ctx.strokeStyle = rgba(color, 0.95 * a);
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.strokeRect(x + p, y + p, s - p * 2, s - p * 2);
  // A lit top edge is the whole difference between a stack of squares and a stack of bricks.
  ctx.fillStyle = rgba('#ffffff', 0.32 * a);
  ctx.fillRect(x + p * 1.8, y + p * 1.8, s - p * 3.6, Math.max(1, s * 0.08));
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const target = Math.max(7, Math.min(26, h / 4.5));
  const cols = Math.max(4, 2 * Math.round(w / (target * 2)));
  const cell = w / cols; // exact division: the grid reaches both edges, no gutters
  const pieces = build(cols);
  const step = FILL / pieces.length;
  const clearing = span(t, CLEAR, CLEAR + 340);
  const gone = span(t, CLEAR + 340, CLEAR + 760);
  // ONE swell at the clear, and nothing on a piece locking: a flash per landing put a strobe on the
  // card every half second, which is the whole reason the first pass read as noisy.
  const rowFlash = clearing > 0 && clearing < 1 ? Math.sin(clearing * Math.PI) * 0.55 : 0;

  pieces.forEach((piece, i) => {
    const start = i * step;
    const land = start + FALL;
    if (t < start) return;
    const falling = t < land;
    const alpha = falling || gone <= 0 ? 1 : 1 - gone;
    if (alpha <= 0) return;
    const lift = falling ? (1 - easeIn(span(t, start, land))) * (h + cell * 2) : 0;

    if (falling) {
      // Ghost: where it will land. Reads as intent, and fills the empty upper half of the box.
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = rgba(piece.color, 0.28);
      ctx.lineWidth = 1;
      for (const [c, r] of piece.cells) {
        ctx.strokeRect(c * cell + 1, h - (r + 1) * cell + 1, cell - 2, cell - 2);
      }
      ctx.setLineDash([]);
    }
    for (const [c, r] of piece.cells) {
      const x = c * cell;
      const y = h - (r + 1) * cell - lift;
      block(ctx, x, y, cell, piece.color, alpha);
      if (rowFlash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba('#ffffff', 0.45 * rowFlash * alpha);
        ctx.fillRect(x, y, cell, cell);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  });

  // The clear: the two rows blow apart sideways along the whole width as they go.
  if (gone > 0 && gone < 1) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < cols; i++) {
      const dir = i % 2 ? 1 : -1;
      blob(
        ctx,
        (i + 0.5) * cell + dir * gone * cell * (1 + hash(i, 41) * 4),
        h - cell * (0.5 + (i % 2)),
        cell * 0.45,
        (1 - gone) * 0.6,
      );
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function render(layer: HTMLElement): (() => void) | void {
  if (typeof document === 'undefined') return;
  return mountScene(layer, 'card-well', paint, { loopMs: LOOP, stillMs: 2300, maxLive: 8 });
}

export const cardWell: CardEffectModule = {
  id: 'card-well',
  type: 'card_effect',
  costDust: 4000,
  since: '2026-08-18',
  className: 'card-fx-well',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  labels: { name: 'shop.cardWell', desc: 'shop.cardWellDesc' },
  render,
};
