import { useCallback, useEffect, useRef, type MutableRefObject, type RefObject } from 'react';
import { lighten, rgbStr, type Rgb } from './tokens';

/** Цель, к которой движок плавно подтягивает поверхность (Vessel мутирует её при смене фазы). */
export interface LiquidTarget {
  level: number;
  color: Rgb;
  amp: number;
  turb: boolean;
  /** Размер карточки в px (из ResizeObserver) — система координат viewBox. */
  W: number;
  H: number;
  /** Разовый «вздох» поверхности (пик «на стриме»). */
  kick: boolean;
}

export interface LiquidEls {
  fill: RefObject<SVGPathElement | null>;
  clip: RefObject<SVGPathElement | null>;
  meniscus: RefObject<SVGPathElement | null>;
  stop0: RefObject<SVGStopElement | null>;
  stop1: RefObject<SVGStopElement | null>;
  disp: RefObject<SVGFEDisplacementMapElement | null>;
  turbEl: RefObject<SVGFETurbulenceElement | null>;
  bubbles: RefObject<SVGGElement | null>;
}

interface Bubble {
  el: SVGCircleElement;
  on: boolean;
  x: number;
  y: number;
  vy: number;
  r: number;
}

/**
 * Поверхность жидкости как rAF-движок: верхняя кромка = сумма 2–3 синусов
 * (y = level + Σ aᵢ·sin(x·kᵢ + t·ωᵢ)), замкнутая в путь до дна. Пишет атрибуты
 * напрямую в SVG (без ре-рендера React). Уровень/цвет/амплитуда лерпятся к target.
 *
 * Энергосбережение: цикл ЗАСЫПАЕТ, когда всё пришло к цели и движения нет (amp≈0 —
 * это idle/покой), и просыпается через возвращаемый wake() при смене цели. Пока волна
 * активна (загрузка/статус/кулдаун) — анимируется как задумано. Гейт — снаружи (enabled).
 */
export function useLiquidEngine(
  els: LiquidEls,
  target: MutableRefObject<LiquidTarget>,
  enabled: boolean,
): () => void {
  const elsRef = useRef(els);
  elsRef.current = els;
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let running = false;
    let t = 0;
    let level = target.current.level;
    const color: Rgb = { ...target.current.color };
    let amp = target.current.amp;
    let dispScale = 0;
    let heave = 0;
    let lastStop = '';
    let lastStroke = '';

    const bubbles: Bubble[] = [];
    const bg = elsRef.current.bubbles.current;
    if (bg) {
      for (let i = 0; i < 3; i++) {
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('r', '0');
        bg.appendChild(c);
        bubbles.push({ el: c, on: false, x: 0, y: 0, vy: 0, r: 0 });
      }
    }

    const settled = () => {
      const tg = target.current;
      return (
        amp < 0.04 &&
        tg.amp < 0.04 &&
        Math.abs(level - tg.level) < 0.002 &&
        Math.abs(color.r - tg.color.r) < 0.6 &&
        Math.abs(color.g - tg.color.g) < 0.6 &&
        Math.abs(color.b - tg.color.b) < 0.6 &&
        Math.abs(heave) < 0.15 &&
        dispScale < 0.04 &&
        !tg.turb &&
        !tg.kick &&
        !bubbles.some((b) => b.on)
      );
    };

    const frame = () => {
      const tg = target.current;
      t += 0.016;
      level += (tg.level - level) * 0.12;
      color.r += (tg.color.r - color.r) * 0.08;
      color.g += (tg.color.g - color.g) * 0.08;
      color.b += (tg.color.b - color.b) * 0.08;
      amp += (tg.amp - amp) * 0.06;
      heave += (0 - heave) * 0.08;
      dispScale += ((tg.turb ? 5 : 0) - dispScale) * 0.07;

      const W = tg.W;
      const H = tg.H;
      if (W > 0 && H > 0) {
        if (tg.kick) {
          heave = -0.06 * H;
          tg.kick = false;
        }
        const base = H * (1 - level) + heave;
        // Фиксированное число сегментов: x точно попадает в 0 и W (без float-дрейфа),
        // иначе верхняя кромка не дотягивала до правого края и замыкание уходило
        // диагональю в угол — отсюда «дыра» справа.
        const N = Math.max(12, Math.round(W / 14));
        let d = '';
        let m = '';
        for (let i = 0; i <= N; i++) {
          const x = (i / N) * W;
          let y =
            base + amp * Math.sin(x * 0.022 + t * 1.7) + amp * 0.6 * Math.sin(x * 0.013 - t * 1.05 + 1.3);
          if (dispScale > 1.5) y += amp * 0.4 * Math.sin(x * 0.04 + t * 2.4);
          const seg = `${i === 0 ? 'M' : ' L'}${x.toFixed(1)},${y.toFixed(1)}`;
          d += seg;
          m += seg;
        }
        d += ` L${W.toFixed(1)},${H.toFixed(1)} L0,${H.toFixed(1)} Z`;

        const e = elsRef.current;
        e.fill.current?.setAttribute('d', d);
        e.clip.current?.setAttribute('d', d);
        const men = e.meniscus.current;
        if (men) {
          men.setAttribute('d', m);
          const stroke = rgbStr(lighten(color, 0.35));
          if (stroke !== lastStroke) {
            men.setAttribute('stroke', stroke);
            lastStroke = stroke;
          }
          men.style.opacity = level > 0.02 ? '1' : '0';
        }
        const cs = rgbStr(color);
        if (cs !== lastStop) {
          e.stop0.current?.setAttribute('stop-color', cs);
          e.stop1.current?.setAttribute('stop-color', cs);
          lastStop = cs;
        }
        e.disp.current?.setAttribute('scale', dispScale.toFixed(2));
        if (dispScale > 0.5 && e.turbEl.current) {
          const bf = 0.012 + 0.006 * Math.sin(t * 0.4);
          e.turbEl.current.setAttribute('baseFrequency', `${bf.toFixed(4)} ${(bf * 1.6).toFixed(4)}`);
        }

        for (const b of bubbles) {
          if (!b.on && tg.turb && Math.random() < 0.012) {
            b.on = true;
            b.x = W * 0.12 + Math.random() * W * 0.76;
            b.y = H - 4;
            b.r = 2 + Math.random() * 3;
            b.vy = 14 + Math.random() * 16;
          }
          if (b.on) {
            b.y -= b.vy * 0.05;
            if (b.y < base + 2) {
              b.on = false;
              b.el.setAttribute('r', '0');
            } else {
              b.el.setAttribute('cx', b.x.toFixed(1));
              b.el.setAttribute('cy', b.y.toFixed(1));
              b.el.setAttribute('r', b.r.toFixed(1));
              b.el.setAttribute('fill', rgbStr(lighten(color, 0.4)));
              b.el.setAttribute('opacity', '0.5');
            }
          }
        }
      }

      // Засыпаем, когда движение исчерпано (idle/покой) — просыпаемся через wake().
      if (settled()) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(frame);
      }
    };
    wakeRef.current = wake;
    running = true;
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      wakeRef.current = () => {};
      if (bg) bg.replaceChildren();
    };
  }, [enabled, target]);

  return useCallback(() => wakeRef.current(), []);
}
