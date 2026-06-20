import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from './icons';
import { Tooltip } from './Tooltip';

type Size = 'sm' | 'md' | 'lg';

const SIZE: Record<Size, { box: string; glyph: number }> = {
  sm: { box: 'size-8', glyph: 16 },
  md: { box: 'size-9', glyph: 18 },
  lg: { box: 'size-11', glyph: 22 },
};

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  name: IconName;
  /** Обязательная подпись для скринридера; по умолчанию она же — текст тултипа. */
  label: string;
  size?: Size;
  variant?: 'solid' | 'ghost';
  /** Залипшее активное состояние (акцентная подсветка). */
  active?: boolean;
  /**
   * Текст жидкостного тултипа. По умолчанию = label. `null` отключает тултип
   * (для кнопок, у которых рядом и так есть видимая подпись).
   */
  tooltip?: ReactNode;
  /** Привязка тултипа по горизонтали — 'end'/'start' для кнопок у края экрана. */
  tooltipAlign?: 'center' | 'start' | 'end';
  /** Сторона тултипа — 'right'/'left' для вертикальных меню, 'top' для нижнего края. */
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
  /** Классы для ОБЁРТКИ-тултипа (layout: ml-auto и т.п.). className — для самой кнопки. */
  wrapClassName?: string;
}

/**
 * Круглая icon-кнопка — «круглая семья» бренда (контрапункт угловатым элементам).
 * Подпись показывается жидкостным тултипом (Tooltip) вместо нативного `title`.
 */
export function IconButton({
  name,
  label,
  size = 'md',
  variant = 'solid',
  active = false,
  className = '',
  tooltip,
  tooltipAlign = 'center',
  tooltipPlacement = 'bottom',
  wrapClassName = '',
  ...rest
}: IconButtonProps) {
  const s = SIZE[size];
  const base =
    variant === 'ghost' ? 'border-transparent bg-transparent' : 'border-border bg-surface';
  const btn = (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active || undefined}
      data-active={active ? 'true' : undefined}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border text-muted outline-none transition-[color,background-color,border-color,transform] duration-[180ms] ease-out hover:border-border-strong hover:text-text focus-visible:[box-shadow:var(--shadow-focus)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 data-[active=true]:bg-accent-soft data-[active=true]:text-accent ${s.box} ${base} ${className}`}
      {...rest}
    >
      <Icon name={name} size={s.glyph} />
    </button>
  );

  const tip = tooltip === undefined ? label : tooltip;
  if (tip === null) return wrapClassName ? <span className={wrapClassName}>{btn}</span> : btn;

  return (
    <Tooltip content={tip} align={tooltipAlign} placement={tooltipPlacement} focusable={false} className={`shrink-0 ${wrapClassName}`}>
      {btn}
    </Tooltip>
  );
}
