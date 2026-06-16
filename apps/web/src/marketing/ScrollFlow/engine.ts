import type { IconName } from '@/ui/icons';

/**
 * Чистая математика и константы анимации «как это работает» — без React/DOM.
 * Геометрия дорожки, тайминги, развилка модерации и сэмплирование форм иконок.
 */

export type Pt = [number, number];

export const STAGE_ICONS: IconName[] = ['upload', 'loader', 'shield', 'play'];
export const SVGNS = 'http://www.w3.org/2000/svg';

export const CX = 340;
export const BASE_Y = 128;
export const WS = [0, 220, 440, 660, 900]; // мировые X станций: [кучка, загрузка, обработка, модерация, на стриме]
export const STATION_X = [220, 440, 660, 900];
export const N = 46;
// Чередование «пауза на этапе» (h) и «перелёт» (t). Паузы дают форме собраться и читаться.
export const PHASES: Array<['h', number] | ['t', number, number]> = [
  ['h', 0], ['t', 0, 1], ['h', 1], ['t', 1, 2], ['h', 2], ['t', 2, 3], ['h', 3], ['t', 3, 4], ['h', 4],
];
export const WEIGHTS = [0.7, 1.15, 0.95, 1.15, 0.95, 1.15, 0.95, 1.15, 1.05];
export const FWD_DUR = 6500; // длительность прохода вперёд (загрузка → эфир), мс
export const RETURN_DUR = 1000; // быстрый возврат кучки прямо в начало (без станций), мс
export const RETURN_HOP = 64; // высота дуги возврата
export const END_PAUSE = 900; // пауза на результате (в эфире / отклонено) перед возвратом, мс
export const START_PAUSE = 400; // короткая пауза в начале перед новым проходом, мс

// Развилка на станции модерации: исход выбирается раз за проход (forward), держится
// весь forward+reverse, поэтому frame(p, verdict) остаётся чистой функцией и реверс
// (ping-pong) проигрывается без рывка. Порядок подобран так, что первый показ гостю —
// всегда «одобрено», а «отклонено» выпадает раз в 4 прохода.
export const APPROVE = 0;
export const REJECT = 1;
export const TRUST = 2;
export const ORDER = [APPROVE, TRUST, APPROVE, REJECT];
export const TRUST_HOP = 92; // высота дуги, по которой «свой» перелетает ПОВЕРХ щита
export const REJECT_RECOIL = 40; // отскок влево от щита
export const REJECT_DIP = 14; // просадка к дорожке на отскоке
export const REJECT_SCAT = 34; // как сильно пиксели рассыпаются и собираются обратно

/** Трапеция 0→1→0: плавный заход [a,b], плато, плавный выход [c,d]. Для прозрачности стампов. */
export const pulse = (x: number, a: number, b: number, c: number, d: number) =>
  x < a ? 0 : x < b ? (x - a) / (b - a) : x < c ? 1 : x < d ? 1 - (x - c) / (d - c) : 0;

export const smooth = (t: number) => t * t * (3 - 2 * t);

export function buildTimeline() {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  const cum = [0];
  let run = 0;
  for (const w of WEIGHTS) {
    run += w / total;
    cum.push(run);
  }
  return cum;
}

/** Пиксельные точки формы — сэмплируем заливку path иконки на офскрин-канвасе. */
export function sampleShape(ctx: CanvasRenderingContext2D, d: string): Pt[] {
  const path = new Path2D(d);
  const raw: Pt[] = [];
  for (let y = 1; y < 24; y += 1.15) {
    for (let x = 1; x < 24; x += 1.15) {
      if (ctx.isPointInPath(path, x, y)) raw.push([x, y]);
    }
  }
  const step = Math.max(1, Math.ceil(raw.length / N));
  const out: Pt[] = [];
  for (let i = 0; i < raw.length; i += step) {
    const pt = raw[i]!;
    out.push([(pt[0] - 12) * 1.65, (pt[1] - 12) * 1.65]);
  }
  if (out.length < 6) return [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, 0], [0, -6]];
  return out;
}
