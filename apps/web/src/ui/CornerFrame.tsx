import type { CSSProperties, ReactNode } from 'react';

/**
 * Фирменные уголки-скобки (подпись бренда, см. motion.dev). По наведению/фокусу
 * рамка «выезжает» наружу; опционально — диагональная заливка (`fill`). Вся
 * механика в CSS-утилитах `.cornerframe`/`.cornerframe-fill` (apps/web/src/index.css).
 */
export function CornerFrame({
  tone = 'default',
  active = false,
  fill = false,
  className = '',
  children,
}: {
  tone?: 'default' | 'accent' | 'muted';
  /** Принудительно «активное» (выехавшее) состояние без наведения. */
  active?: boolean;
  /** Включить диагональную заливку на ховере. */
  fill?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const color =
    tone === 'accent' ? 'var(--color-accent)' : tone === 'muted' ? 'var(--color-muted)' : undefined;
  const style = color ? ({ '--cf-color': color } as CSSProperties) : undefined;
  return (
    <div
      data-active={active ? 'true' : undefined}
      style={style}
      className={`cornerframe ${fill ? 'cornerframe-fill' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
