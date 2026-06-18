import { useRef } from 'react';
import type { FocusEvent, PointerEvent } from 'react';

// Заливка: мягкий старт → быстрая середина → очень медленный конец (дальние участки ползут).
// x2=.1 (а не 0) уводит крутой участок от самого начала к середине, чтобы при наведении
// не «выстреливал» сразу большой кусок; финальная скорость остаётся нулевой (медленный конец).
const FILL_GROW = 'clip-path .8s cubic-bezier(.25, 0, .1, 1)';
// Уход: чуть быстрее чтобы кнопка ощущалась отзывчивой.
const FILL_SHRINK = 'clip-path .6s cubic-bezier(.25, 0, 0, 1)';

export function useFillEffect() {
  const fillRef = useRef<HTMLSpanElement>(null);

  function grow(x: number, y: number) {
    const el = fillRef.current;
    if (!el) return;

    // Вычисляем ровно тот радиус, чтобы накрыть дальний угол от точки входа.
    // Без этого широкие элементы с входом сверху/снизу заполняются «мгновенно»
    // потому что 150% достигается уже в первые ~15% анимации.
    const { width, height } = el.getBoundingClientRect();
    const xPx = (x / 100) * width;
    const yPx = (y / 100) * height;
    const farPx = Math.sqrt(
      Math.max(xPx, width - xPx) ** 2 + Math.max(yPx, height - yPx) ** 2,
    );
    // circle() проценты считаются относительно sqrt((w² + h²) / 2)
    const refLen = Math.sqrt((width ** 2 + height ** 2) / 2);
    const target = Math.ceil((farPx / refLen) * 100) + 2; // +2 — мини-запас

    el.style.transition = 'none';
    el.style.clipPath = `circle(0% at ${x}% ${y}%)`;
    void el.offsetWidth;
    el.style.transition = FILL_GROW;
    el.style.clipPath = `circle(${target}% at ${x}% ${y}%)`;
  }

  function shrink(x: number, y: number) {
    const el = fillRef.current;
    if (!el) return;
    el.style.transition = FILL_SHRINK;
    el.style.clipPath = `circle(0% at ${x}% ${y}%)`;
  }

  function pct(e: PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }

  const handlers = {
    onPointerEnter: (e: PointerEvent<HTMLElement>) => { const { x, y } = pct(e); grow(x, y); },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => { const { x, y } = pct(e); shrink(x, y); },
    onFocus: (e: FocusEvent<HTMLElement>) => { if (e.currentTarget.matches(':focus-visible')) grow(0, 50); },
    onBlur: () => shrink(0, 50),
  };

  return { fillRef, handlers };
}
