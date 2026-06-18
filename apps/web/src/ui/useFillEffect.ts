import { useEffect, useRef } from 'react';
import type { FocusEvent, PointerEvent } from 'react';

// Заливка: мягкий старт → быстрая середина → очень медленный конец (дальние участки ползут).
// x2=.1 (а не 0) уводит крутой участок от самого начала к середине, чтобы при наведении
// не «выстреливал» сразу большой кусок; финальная скорость остаётся нулевой (медленный конец).
const FILL_GROW = 'clip-path .8s cubic-bezier(.25, 0, .1, 1)';
// Уход: чуть быстрее чтобы кнопка ощущалась отзывчивой.
const FILL_SHRINK = 'clip-path .6s cubic-bezier(.25, 0, 0, 1)';

// circle() проценты считаются относительно sqrt((w² + h²) / 2)
function targetPct(el: HTMLSpanElement, x: number, y: number) {
  const { width, height } = el.getBoundingClientRect();
  const xPx = (x / 100) * width;
  const yPx = (y / 100) * height;
  const farPx = Math.sqrt(
    Math.max(xPx, width - xPx) ** 2 + Math.max(yPx, height - yPx) ** 2,
  );
  const refLen = Math.sqrt((width ** 2 + height ** 2) / 2);
  return Math.ceil((farPx / refLen) * 100) + 2; // +2 — мини-запас
}

export function useFillEffect() {
  const fillRef = useRef<HTMLSpanElement>(null);
  // Последняя позиция ховера (null = не наведено). Нужна ResizeObserver'у для пересчёта.
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // Когда карточка раскрывается (высота растёт), fillRef тоже растягивается.
  // Старый target%, вычисленный для маленькой карточки, не покрывает новый размер —
  // пересчитываем и мгновенно прыгаем к правильному значению без transition.
  useEffect(() => {
    const el = fillRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!lastPos.current) return;
      const { x, y } = lastPos.current;
      el.style.transition = 'none';
      el.style.clipPath = `circle(${targetPct(el, x, y)}% at ${x}% ${y}%)`;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function grow(x: number, y: number) {
    const el = fillRef.current;
    if (!el) return;

    lastPos.current = { x, y };

    // Вычисляем ровно тот радиус, чтобы накрыть дальний угол от точки входа.
    // Без этого широкие элементы с входом сверху/снизу заполняются «мгновенно»
    // потому что 150% достигается уже в первые ~15% анимации.
    el.style.transition = 'none';
    el.style.clipPath = `circle(0% at ${x}% ${y}%)`;
    void el.offsetWidth;
    el.style.transition = FILL_GROW;
    el.style.clipPath = `circle(${targetPct(el, x, y)}% at ${x}% ${y}%)`;
  }

  function shrink(x: number, y: number) {
    const el = fillRef.current;
    if (!el) return;
    lastPos.current = null;
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
