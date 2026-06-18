import type { IconName } from '@/ui/icons';

/**
 * Чистая математика анимации воронки «как это работает» — без React/DOM.
 * Один «токен» отправки едет по треку между 4 узлами-этапами; на модерации —
 * развилка (одобрено / отклонено / свой). Геометрия в координатах viewBox 0 0 680 150.
 */

export const STAGE_ICONS: IconName[] = ['upload', 'loader', 'shield', 'play'];

// Геометрия трека.
export const NODE_X = [70, 250, 430, 610];
export const TRACK_Y = 78;
export const NODE_R = 22;
export const MOD = 2; // индекс узла модерации
export const STREAM = 3; // индекс узла «на стриме»

// Высоты дуг и амплитуды.
export const HOP = 14; // лёгкая дуга токена на перегонах
export const TRUST_HOP = 70; // «свой» перелетает поверх модерации высокой дугой
export const REJECT_RECOIL = 34; // отскок токена влево от щита при отказе
export const REJECT_DIP = 12; // просадка к треку на отскоке
export const RETURN_HOP = 58; // высота дуги возврата токена в начало

// Тайминги (мс).
export const FWD_DUR = 6200; // проход вперёд (загрузка → исход)
export const END_PAUSE = 1100; // пауза на результате перед возвратом
export const RETURN_DUR = 900; // быстрый возврат токена в начало
export const START_PAUSE = 450; // короткая пауза перед новым проходом

// Развилка модерации: исход держим весь проход (frame — чистая функция p).
// Порядок подобран так, что первый показ гостю — «одобрено», «отклонено» раз в 4 прохода.
export const APPROVE = 0;
export const REJECT = 1;
export const TRUST = 2;
export const ORDER = [APPROVE, TRUST, APPROVE, REJECT];

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Трапеция 0→1→0: плавный заход [a,b], плато [b,c], плавный выход [c,d]. Для прозрачности стампов. */
export const pulse = (x: number, a: number, b: number, c: number, d: number) =>
  x < a ? 0 : x < b ? (x - a) / (b - a) : x < c ? 1 : x < d ? 1 - (x - c) / (d - c) : 0;

/** Состояние одного кадра: позиция токена, подсветка узлов, заливка связей, стампы. */
export interface Frame {
  x: number;
  y: number;
  /** Прозрачность токена (отказ — рассеивается). */
  op: number;
  /** Масштаб токена (взлёт «своего» — чуть крупнее). */
  sc: number;
  /** Какие узлы подсвечены (мятным). */
  lit: [boolean, boolean, boolean, boolean];
  /** Заливка 3 связей между узлами, 0..1. */
  seg: [number, number, number];
  /** Расходящееся кольцо при попадании «на стрим», 0..1. */
  live: number;
  stampApprove: number;
  stampReject: number;
  stampTrust: number;
}

const X = NODE_X;

/** Кадр прохода вперёд для прогресса p∈[0,1] и выбранного исхода. */
export function frameState(p: number, verdict: number): Frame {
  let x: number;
  let y = TRACK_Y;
  let op = 1;
  let sc = 1;
  let lit: Frame['lit'] = [true, false, false, false];
  let live = 0;

  if (verdict === TRUST) {
    if (p < 0.22) {
      const t = p / 0.22;
      x = lerp(X[0]!, X[1]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
    } else if (p < 0.3) {
      x = X[1]!;
      lit = [true, true, false, false];
    } else if (p < 0.82) {
      // Перелёт поверх щита одной высокой дугой 1→3, в модерацию не заходит.
      const t = (p - 0.3) / 0.52;
      x = lerp(X[1]!, X[3]!, smooth(t));
      y = TRACK_Y - TRUST_HOP * Math.sin(Math.PI * t);
      sc = 1 + 0.12 * Math.sin(Math.PI * t);
      lit = [true, true, x >= X[2]!, false];
    } else {
      const t = (p - 0.82) / 0.18;
      x = X[3]!;
      lit = [true, true, true, true];
      live = clamp01(t / 0.5);
    }
  } else if (verdict === REJECT) {
    if (p < 0.22) {
      const t = p / 0.22;
      x = lerp(X[0]!, X[1]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
    } else if (p < 0.3) {
      x = X[1]!;
      lit = [true, true, false, false];
    } else if (p < 0.52) {
      const t = (p - 0.3) / 0.22;
      x = lerp(X[1]!, X[2]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
      lit = [true, true, false, false];
    } else if (p < 0.64) {
      // Удар о щит и отскок влево с просадкой.
      const t = (p - 0.52) / 0.12;
      x = X[2]! - REJECT_RECOIL * smooth(t);
      y = TRACK_Y - REJECT_DIP * Math.sin(Math.PI * t);
      lit = [true, true, true, false];
    } else {
      // Рассеивается — на стрим не попадает.
      const t = (p - 0.64) / 0.36;
      x = X[2]! - REJECT_RECOIL;
      op = clamp01(1 - t / 0.5);
      lit = [true, true, true, false];
    }
  } else {
    // APPROVE: проезд через все узлы с паузой-проверкой на модерации.
    if (p < 0.22) {
      const t = p / 0.22;
      x = lerp(X[0]!, X[1]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
    } else if (p < 0.3) {
      x = X[1]!;
      lit = [true, true, false, false];
    } else if (p < 0.5) {
      const t = (p - 0.3) / 0.2;
      x = lerp(X[1]!, X[2]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
      lit = [true, true, false, false];
    } else if (p < 0.64) {
      x = X[2]!;
      lit = [true, true, true, false];
    } else if (p < 0.86) {
      const t = (p - 0.64) / 0.22;
      x = lerp(X[2]!, X[3]!, smooth(t));
      y = TRACK_Y - HOP * Math.sin(Math.PI * t);
      lit = [true, true, true, false];
    } else {
      const t = (p - 0.86) / 0.14;
      x = X[3]!;
      lit = [true, true, true, true];
      live = clamp01(t / 0.5);
    }
  }

  // Заливка связей по текущему x; для отказа не «отливаем» назад и не зажигаем последнюю.
  const seg: Frame['seg'] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    seg[k] = clamp01((x - X[k]!) / (X[k + 1]! - X[k]!));
  }
  if (verdict === REJECT) {
    if (p >= 0.52) seg[1] = 1;
    seg[2] = 0;
  }

  return {
    x,
    y,
    op,
    sc,
    lit,
    seg,
    live,
    stampApprove: verdict === APPROVE ? pulse(p, 0.52, 0.58, 0.74, 0.84) : 0,
    stampReject: verdict === REJECT ? pulse(p, 0.54, 0.62, 0.86, 0.98) : 0,
    stampTrust: verdict === TRUST ? pulse(p, 0.4, 0.5, 0.66, 0.78) : 0,
  };
}

/** Кадр возврата: токен дугой летит из конечной точки прямо в начало, связи «сливаются». */
export function frameReturn(rp: number, verdict: number): Frame {
  const e = smooth(rp);
  const endX = verdict === REJECT ? X[2]! - REJECT_RECOIL : X[3]!;
  const drain = 1 - e;
  return {
    x: lerp(endX, X[0]!, e),
    y: TRACK_Y - RETURN_HOP * Math.sin(Math.PI * rp),
    // Отклонённый токен был рассеян — на возврате собирается и проявляется ближе к дому.
    op: verdict === REJECT ? smooth(clamp01((rp - 0.35) / 0.65)) : 1,
    sc: 1,
    lit: [true, false, false, false],
    seg: [drain, drain, verdict === REJECT ? 0 : drain],
    live: 0,
    stampApprove: 0,
    stampReject: 0,
    stampTrust: 0,
  };
}
