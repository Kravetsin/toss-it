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
  /** Required screen-reader label; also the default tooltip text. */
  label: string;
  size?: Size;
  variant?: 'solid' | 'ghost';
  active?: boolean;
  /** Tooltip text; defaults to label. `null` disables it (when a visible label is already nearby). */
  tooltip?: ReactNode;
  tooltipAlign?: 'center' | 'start' | 'end';
  tooltipPlacement?: 'top' | 'bottom' | 'left' | 'right';
  /** Classes for the tooltip wrapper (layout, e.g. ml-auto); className targets the button itself. */
  wrapClassName?: string;
  /** Renders an <a> instead of a <button> — keeps middle-click / "open in new tab" working. */
  href?: string;
  /** With href: save the target instead of navigating (same-origin only, per the HTML spec). */
  download?: string;
  /** With href: open in a new tab. Always noopener — these targets are user-submitted. */
  newTab?: boolean;
}

/** Round icon button; label shown via Tooltip rather than native `title`. */
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
  href,
  download,
  newTab = false,
  ...rest
}: IconButtonProps) {
  const s = SIZE[size];
  const base =
    variant === 'ghost' ? 'border-transparent bg-transparent' : 'border-border bg-surface';
  const shared = {
    'aria-label': label,
    'aria-pressed': active || undefined,
    'data-active': active ? 'true' : undefined,
    className: `inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border text-muted outline-none transition-[color,background-color,border-color,transform] duration-[180ms] ease-out hover:border-border-strong hover:text-text focus-visible:[box-shadow:var(--shadow-focus)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 data-[active=true]:bg-accent-soft data-[active=true]:text-accent ${s.box} ${base} ${className}`,
  };
  const btn = href ? (
    // Button-only props (onClick, disabled…) are deliberately not forwarded here: a link navigates.
    <a
      {...shared}
      href={href}
      download={download}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer nofollow' : undefined}
    >
      <Icon name={name} size={s.glyph} />
    </a>
  ) : (
    <button type="button" {...shared} {...rest}>
      <Icon name={name} size={s.glyph} />
    </button>
  );

  const tip = tooltip === undefined ? label : tooltip;
  if (tip === null) return wrapClassName ? <span className={wrapClassName}>{btn}</span> : btn;

  return (
    <Tooltip
      content={tip}
      align={tooltipAlign}
      placement={tooltipPlacement}
      focusable={false}
      className={`shrink-0 ${wrapClassName}`}
    >
      {btn}
    </Tooltip>
  );
}
