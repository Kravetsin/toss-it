import type { CardEffectModule, Surface } from '../types';
import {
  mountScene,
  sceneHash as hash,
  sceneLighten,
  sceneRgb,
  sceneRgba as rgba,
} from '../canvas';

/**
 * A firefly meadow at night. Two rows of grass sway at the bottom edge — a dim short row behind, a
 * taller brighter one in front, seated on a dark ground strip — and sixteen fireflies drift above
 * on slow closed paths. Between flashes they are near-invisible specks; every three seconds a
 * FLASH WAVE sweeps the meadow left to right and each fly fires as the front passes it. That is
 * the real mechanic (Photinus carolinus flashes in sweeping synchrony), and it is also what makes
 * the effect read on a stream: one bright coordinated event instead of sixteen dim random blinks.
 *
 * All drift and sway frequencies are whole cycles per loop (three waves per 9s), so the wrap is
 * seamless. The colour upgrade repaints the whole PALETTE: the flash glow and core, the card's
 * bottom-edge glow (the meadow's ambient light, which also kindles under the passing wave), and
 * the grass as a darkened cut of the same hue — one meadow, one colour family.
 */

const LOOP = 9000;
const SECS = LOOP / 1000;
const WAVE = 3; // seconds between flash fronts; SECS/WAVE is integral, so the loop closes
const TAU = Math.PI * 2;
const GREEN = '#d6ffaa';

const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));

function spill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  a: number,
): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, 0.22 * a));
  g.addColorStop(0.45, rgba(color, 0.09 * a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function scene(base: string) {
  const core = sceneLighten(base, 0.55);
  // The grass is the same hue, cut down to foliage darkness — the front row keeps more of it.
  const [br, bg, bb] = sceneRgb(base);
  const grassF = `rgba(${Math.round(br * 0.5)},${Math.round(bg * 0.56)},${Math.round(bb * 0.5)},0.65)`;
  const grassB = `rgba(${Math.round(br * 0.32)},${Math.round(bg * 0.37)},${Math.round(bb * 0.32)},0.45)`;
  return (ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void => {
    const ts = t / 1000;
    // Ground: a dark strip that seats the meadow before any blade is drawn.
    const gh = clamp(h * 0.16, 6, 24);
    const ground = ctx.createLinearGradient(0, h - gh, 0, h);
    ground.addColorStop(0, 'rgba(18,28,23,0)');
    ground.addColorStop(1, 'rgba(18,28,23,0.75)');
    ctx.fillStyle = ground;
    ctx.fillRect(0, h - gh, w, gh);
    // The card's bottom edge GLOWS in the palette colour — the meadow's ambient light. A steady
    // base wash, plus slices that kindle under the flash wave as it sweeps by overhead.
    const glowH = clamp(h * 0.3, 10, 46);
    const wash = ctx.createLinearGradient(0, h, 0, h - glowH);
    wash.addColorStop(0, rgba(base, 0.14));
    wash.addColorStop(1, rgba(base, 0));
    ctx.fillStyle = wash;
    ctx.fillRect(0, h - glowH, w, glowH);
    for (let si = 0; si < 10; si++) {
      const xc = ((si + 0.5) / 10) * w;
      const local = (((ts - (xc / w) * 1.2) % WAVE) + WAVE) % WAVE;
      const fl = local < 0.6 ? Math.pow(1 - local / 0.6, 1.6) : 0;
      if (fl < 0.03) continue;
      ctx.globalAlpha = fl;
      ctx.fillStyle = wash;
      ctx.fillRect((si / 10) * w, h - glowH, w / 10 + 1, glowH);
      ctx.globalAlpha = 1;
    }
    // Two rows of grass, ~one blade per 13px — a meadow's edge, not a picket fence.
    const nb = Math.round(clamp(w / 13, 18, 46));
    for (let i = 0; i < nb; i++) {
      const back = i % 2 === 0;
      const x = (i + 0.15 + hash(i, 81) * 0.7) * (w / nb);
      const hgt = clamp(h * 0.22, 8, 34) * (0.55 + hash(i, 82) * 0.85) * (back ? 0.62 : 1);
      const bend = (hash(i, 83) - 0.5) * 9;
      const sway = Math.sin((TAU * ts) / SECS + hash(i, 84) * TAU) * (back ? 1.6 : 2.6);
      ctx.strokeStyle = back ? grassB : grassF;
      ctx.lineWidth = back ? 1 : 1.4;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + bend * 0.4, h - hgt * 0.6, x + bend + sway, h - hgt);
      ctx.stroke();
    }
    for (let i = 0; i < 16; i++) {
      const n1 = 1 + Math.floor(hash(i, 91) * 2);
      const n2 = 1 + Math.floor(hash(i, 92) * 3);
      const ph = hash(i, 93) * TAU;
      const x = hash(i, 94) * w + Math.sin((TAU * n1 * ts) / SECS + ph) * (14 + hash(i, 95) * 22);
      const y =
        h * (0.15 + hash(i, 96) * 0.55) +
        Math.sin((TAU * n2 * ts) / SECS + ph * 2) * (8 + hash(i, 97) * 12);
      // The sync wave: a flash front sweeps the meadow left to right every WAVE seconds.
      const local = (((ts - (x / w) * 1.2) % WAVE) + WAVE) % WAVE;
      const fl =
        local < 0.45 ? Math.pow(1 - local / 0.45, 1.6) * (local < 0.07 ? local / 0.07 : 1) : 0;
      ctx.fillStyle = rgba(base, 0.1 + fl * 0.06);
      ctx.fillRect(x, y, 1.4, 1.4);
      if (fl > 0.02) {
        spill(ctx, x, y, 13 + fl * 12, base, fl * 1.5);
        ctx.fillStyle = rgba(core, fl);
        ctx.beginPath();
        ctx.arc(x, y, 1.5 + fl * 0.8, 0, TAU);
        ctx.fill();
      }
    }
  };
}

function render(
  layer: HTMLElement,
  _surface: Surface,
  _compact: boolean,
  color?: string,
): (() => void) | void {
  if (typeof document === 'undefined') return;
  return mountScene(layer, 'card-fireflies', scene(color || GREEN), {
    loopMs: LOOP,
    stillMs: 1000,
    maxLive: 8,
  });
}

export const cardFireflies: CardEffectModule = {
  id: 'card-fireflies',
  type: 'card_effect',
  costDust: 4000,
  since: '2026-08-28',
  className: 'card-fx-fireflies',
  // Nominal only: a render effect owns the whole layer, but counts must be non-zero for the layer to
  // be created at all (see CardEffectModule.render / cardEffectLayerClass).
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  colorUpgrade: 'card-fireflies-color',
  labels: { name: 'shop.cardFireflies', desc: 'shop.cardFirefliesDesc' },
  render,
  // No css: the whole effect is the JS canvas; the shared `.card-fx` base already clips the layer.
};
