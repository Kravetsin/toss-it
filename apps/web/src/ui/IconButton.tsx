import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './icons';

type Size = 'sm' | 'md' | 'lg';

const SIZE: Record<Size, { box: string; glyph: number }> = {
  sm: { box: 'size-8', glyph: 16 },
  md: { box: 'size-9', glyph: 18 },
  lg: { box: 'size-11', glyph: 22 },
};

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  name: IconName;
  /** Обязательная подпись для скринридера. */
  label: string;
  size?: Size;
  variant?: 'solid' | 'ghost';
  /** Залипшее активное состояние (акцентная подсветка). */
  active?: boolean;
}

/**
 * Круглая icon-кнопка — «круглая семья» бренда (контрапункт угловатым элементам).
 */
export function IconButton({
  name,
  label,
  size = 'md',
  variant = 'solid',
  active = false,
  className = '',
  ...rest
}: IconButtonProps) {
  const s = SIZE[size];
  const base =
    variant === 'ghost' ? 'border-transparent bg-transparent' : 'border-border bg-surface';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      data-active={active ? 'true' : undefined}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border text-muted outline-none transition-[color,background-color,border-color,transform] duration-[180ms] ease-out hover:border-border-strong hover:text-text focus-visible:[box-shadow:var(--shadow-focus)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 data-[active=true]:bg-accent-soft data-[active=true]:text-accent ${s.box} ${base} ${className}`}
      {...rest}
    >
      <Icon name={name} size={s.glyph} />
    </button>
  );
}
