import type { CardEffectModule } from '../types';
import { mountScene, sceneHash as hash, sceneRgba as rgba } from '../canvas';

/**
 * Aurora curtains along the card's top edge — a mood effect, not an event: two slow harmonics per
 * curtain, three curtains breathing at different tempos, colour drifting mint → violet → teal.
 *
 * The real aurora is bright at its lower HEM, and the light scatters upward — so each curtain is a
 * polygon filled with a gradient fading up, a reflected wash cast DOWN onto the card, and a bloom
 * along the hem line. The bloom is a gaussian shadowBlur on the hem path: a stack of stepped strokes
 * was tried first and its width steps read as contours around the line.
 *
 * Seamless by construction: every angular speed is an INTEGER number of turns per loop (n1/n2 per
 * curtain, and each star's twinkle rate), so the wrap has no seam to hide. The band height follows
 * the box height, which is what keeps a 40px chat row wearing a visible curtain instead of a sliver.
 *
 * COST: the shadowBlur strokes are the one non-trivial call — three curtains × three passes on a
 * ~w/8-point path. maxLive bounds the worst case; past the cap instances show the still frame.
 */

const LOOP = 24000;
const SECS = LOOP / 1000;
const TAU = Math.PI * 2;

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

interface Curtain {
  color: string;
  ampF: number;
  k: number; // spatial frequency, rad/px — absolute, so folds don't stretch with the box
  n1: number; // whole turns per loop of the two harmonics; integers keep the loop seamless
  n2: number;
  baseF: number;
  a: number;
}
const CURTAINS: Curtain[] = [
  { color: '#8df0cc', ampF: 0.3, k: 0.021, n1: 2, n2: -3, baseF: 0.55, a: 0.34 },
  { color: '#b18cff', ampF: 0.24, k: 0.014, n1: -1, n2: 2, baseF: 0.8, a: 0.24 },
  { color: '#5fd9c5', ampF: 0.2, k: 0.03, n1: 1, n2: -2, baseF: 0.42, a: 0.2 },
];

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  const ts = t / 1000;
  const band = clamp(h * 0.5, 16, 120);

  const nStars = Math.round(clamp((w * h) / 3800, 8, 26));
  for (let i = 0; i < nStars; i++) {
    const m = 3 + Math.floor(hash(i, 53) * 5);
    const tw = 0.6 + 0.4 * Math.sin(TAU * m * (ts / SECS) + hash(i, 54) * TAU);
    ctx.fillStyle = `rgba(220,245,235,${0.15 * tw})`;
    ctx.fillRect(
      hash(i, 51) * w,
      hash(i, 52) * h,
      0.5 + hash(i, 55) * 1.1,
      0.5 + hash(i, 55) * 1.1,
    );
  }

  for (const c of CURTAINS) {
    const amp = band * c.ampF;
    const base = band * c.baseF;
    const s1 = (TAU * c.n1) / SECS;
    const s2 = (TAU * c.n2) / SECS;
    const edge = (x: number): number =>
      base +
      Math.sin(x * c.k + ts * s1) * amp * 0.6 +
      Math.sin(x * c.k * 2.3 + ts * s2 + 2) * amp * 0.4;
    const hem = (): void => {
      ctx.beginPath();
      for (let x = 0; x <= w + 8; x += 8) {
        const y = edge(x);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    };

    const g = ctx.createLinearGradient(0, band, 0, 0);
    g.addColorStop(0, rgba(c.color, c.a * 1.25));
    g.addColorStop(0.55, rgba(c.color, c.a * 0.4));
    g.addColorStop(1, rgba(c.color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, edge(x));
    ctx.lineTo(w, 0);
    ctx.closePath();
    ctx.fill();

    // The hem casts light DOWN onto the card: a soft reflected wash under the curtain.
    const refl = ctx.createLinearGradient(0, base, 0, base + band * 1.1);
    refl.addColorStop(0, rgba(c.color, c.a * 0.4));
    refl.addColorStop(1, rgba(c.color, 0));
    ctx.fillStyle = refl;
    hem();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(c.color, c.a * 0.9);
    ctx.lineWidth = 2.2;
    ctx.shadowColor = rgba(c.color, 0.85);
    ctx.shadowBlur = clamp(band * 0.4, 10, 26);
    hem();
    ctx.stroke();
    hem();
    ctx.stroke();
    ctx.shadowBlur = clamp(band * 0.12, 4, 9);
    ctx.strokeStyle = rgba('#eafff6', c.a * 1.6);
    ctx.lineWidth = 1.3;
    hem();
    ctx.stroke();
    ctx.restore();
  }
}

function render(layer: HTMLElement): (() => void) | void {
  if (typeof document === 'undefined') return;
  return mountScene(layer, 'card-aurora', paint, { loopMs: LOOP, stillMs: 2000, maxLive: 6 });
}

export const cardAurora: CardEffectModule = {
  id: 'card-aurora',
  type: 'card_effect',
  costDust: 4000,
  since: '2026-08-28',
  className: 'card-fx-aurora',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  labels: { name: 'shop.cardAurora', desc: 'shop.cardAuroraDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
