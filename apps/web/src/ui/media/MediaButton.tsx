import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from '@/ui/icons';
import { Tooltip } from '@/ui/Tooltip';
import type { MediaSize } from './types';

interface MediaButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  icon: IconName;
  label: string;
  size?: MediaSize;
  /** Primary button (play/pause) — cyan accent instead of muted. */
  primary?: boolean;
  /** Sticky toggle (e.g. active mute) — persistent fill. */
  pressed?: boolean;
}

/**
 * Player transport button: flat (no inset effect) to keep dense control strips readable.
 */
export function MediaButton({
  icon,
  label,
  size = 'queue',
  primary = false,
  pressed = false,
  className = '',
  ...rest
}: MediaButtonProps) {
  const glyph = size === 'submit' ? 18 : 16;
  const tone = primary
    ? 'text-accent hover:text-accent-hover hover:bg-surface-2 active:bg-surface-2'
    : pressed
      ? 'bg-surface-2 text-text hover:bg-surface-2'
      : 'text-muted hover:text-text hover:bg-surface-2 active:bg-surface-2 disabled:hover:bg-transparent disabled:hover:text-muted';
  return (
    <Tooltip content={label} placement="top" focusable={false} className="shrink-0">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed || undefined}
        className={`grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-none outline-none transition-colors duration-75 focus-visible:[box-shadow:var(--shadow-focus)] disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8 ${tone} ${className}`}
        {...rest}
      >
        <Icon name={icon} size={glyph} />
      </button>
    </Tooltip>
  );
}
