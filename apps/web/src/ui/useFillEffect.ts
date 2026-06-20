import { useEffect, useRef } from 'react';
import type { FocusEvent, PointerEvent } from 'react';

// Fill: soft start, fast middle, very slow end. x2=.1 (not 0) shifts the steep
// part to the middle so hover doesn't shoot out a big chunk instantly.
const FILL_GROW = 'clip-path .8s cubic-bezier(.25, 0, .1, 1)';
// Shrink slightly faster so the button feels responsive.
const FILL_SHRINK = 'clip-path .6s cubic-bezier(.25, 0, 0, 1)';

// circle() percentages are relative to sqrt((w^2 + h^2) / 2)
function targetPct(el: HTMLSpanElement, x: number, y: number) {
  const { width, height } = el.getBoundingClientRect();
  const xPx = (x / 100) * width;
  const yPx = (y / 100) * height;
  const farPx = Math.sqrt(Math.max(xPx, width - xPx) ** 2 + Math.max(yPx, height - yPx) ** 2);
  const refLen = Math.sqrt((width ** 2 + height ** 2) / 2);
  return Math.ceil((farPx / refLen) * 100) + 2; // +2 safety margin
}

export function useFillEffect() {
  const fillRef = useRef<HTMLSpanElement>(null);
  // Last hover position (null = not hovered); ResizeObserver needs it to recompute.
  const lastPos = useRef<{ x: number; y: number } | null>(null);

  // When the card expands, fillRef grows too; the old target% no longer covers it,
  // so recompute and jump to the right value instantly (no transition).
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

    // Compute the exact radius to reach the far corner from the entry point.
    // Otherwise wide elements entered from top/bottom fill "instantly" since 150%
    // is hit within the first ~15% of the animation.
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
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      const { x, y } = pct(e);
      grow(x, y);
    },
    onPointerLeave: (e: PointerEvent<HTMLElement>) => {
      const { x, y } = pct(e);
      shrink(x, y);
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(':focus-visible')) grow(0, 50);
    },
    onBlur: () => shrink(0, 50),
  };

  return { fillRef, handlers };
}
