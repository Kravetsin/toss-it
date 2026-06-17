import { useRef, type ButtonHTMLAttributes, type CSSProperties, type PointerEvent } from 'react';

type ButtonVariant = 'primary' | 'framed' | 'accent' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-[10px] gap-1.5',
  md: 'px-5 py-3.5 gap-2',
  lg: 'min-h-[50px] px-[26px] py-4 gap-2',
};

interface VariantSpec {
  /** классы на самой кнопке */
  cls: string;
  corners: boolean;
  /** круговая заливка-от-курсора + авто-инверсия лейбла (для вариантов с уголками на прозрачном фоне) */
  fill: boolean;
  /** цвет уголков (--cf-color) */
  cf?: string;
  /** цвет лейбла (для НЕ-fill вариантов; у fill лейбл инвертируется blend-режимом) */
  label?: string;
}

const VARIANTS: Record<ButtonVariant, VariantSpec> = {
  // Тёмная штриховка + уголки + круговая заливка-от-курсора (геро-CTA).
  primary: { cls: 'hatch-strong bg-transparent', corners: true, fill: true },
  // То же, но штриховка слабее (10%).
  framed: { cls: 'hatch bg-transparent', corners: true, fill: true },
  // Сплошной акцентный CTA (непрозрачный фон → только уголки, без заливки).
  accent: { cls: 'bg-accent', corners: true, fill: false, cf: 'var(--color-accent)', label: 'text-accent-contrast' },
  danger: { cls: 'bg-danger', corners: true, fill: false, cf: 'var(--color-danger)', label: 'text-danger-contrast' },
  // Тихая обводка с уголками.
  secondary: { cls: 'bg-transparent', corners: true, fill: false, cf: 'var(--color-muted)', label: 'text-text' },
  // Только текст.
  ghost: { cls: 'bg-transparent hover:opacity-80', corners: false, fill: false, label: 'text-muted' },
};

const FILL_EASE = 'clip-path .55s cubic-bezier(.25, 0, 0, 1)';

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  style: restStyle,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  const v = VARIANTS[variant];
  const fillRef = useRef<HTMLSpanElement>(null);

  const style: CSSProperties = { ...restStyle };
  if (v.cf) (style as Record<string, string>)['--cf-color'] = v.cf;

  // Круговая заливка из точки курсора. Чистый сброс (transition:none → reflow → рост) гарантирует
  // старт всегда из реальной точки входа, без «сползания» от старой позиции.
  function grow(x: number, y: number) {
    const el = fillRef.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.clipPath = `circle(0% at ${x}% ${y}%)`;
    void el.offsetWidth;
    el.style.transition = FILL_EASE;
    el.style.clipPath = `circle(150% at ${x}% ${y}%)`;
  }
  function shrink(x: number, y: number) {
    const el = fillRef.current;
    if (!el) return;
    el.style.transition = FILL_EASE;
    el.style.clipPath = `circle(0% at ${x}% ${y}%)`;
  }
  function pct(e: PointerEvent<HTMLButtonElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }

  const fillHandlers = v.fill
    ? {
        onPointerEnter: (e: PointerEvent<HTMLButtonElement>) => {
          const { x, y } = pct(e);
          grow(x, y);
        },
        onPointerLeave: (e: PointerEvent<HTMLButtonElement>) => {
          const { x, y } = pct(e);
          shrink(x, y);
        },
        // Заливку на фокусе запускаем только при клавиатурном фокусе (Tab), не на клике мышью.
        onFocus: (e: React.FocusEvent<HTMLButtonElement>) => {
          if (e.currentTarget.matches(':focus-visible')) grow(0, 50);
        },
        onBlur: () => shrink(0, 50),
      }
    : {};

  return (
    <button
      style={style}
      className={`group inline-flex cursor-pointer select-none items-center justify-center rounded-none border-0 label-mono outline-none transition-[opacity] duration-200 ease-out focus-visible:[box-shadow:var(--shadow-focus)] disabled:pointer-events-none disabled:opacity-40 ${SIZE[size]} ${v.corners ? 'cornerframe' : ''} ${v.cls} ${className}`}
      {...rest}
      {...fillHandlers}
    >
      {v.fill && (
        <span
          ref={fillRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 bg-text"
          style={{ clipPath: 'circle(0% at 50% 50%)' }}
        />
      )}
      <span
        className={`relative z-[1] inline-flex items-center gap-2 ${v.fill ? '' : (v.label ?? '')}`}
        style={v.fill ? { color: '#fff', mixBlendMode: 'difference' } : undefined}
      >
        {children}
      </span>
    </button>
  );
}
