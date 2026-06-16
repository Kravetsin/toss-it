import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from '@/ui/icons';
import type { MediaSize } from './types';

interface MediaButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  icon: IconName;
  label: string;
  size?: MediaSize;
  /** Главная кнопка (play/pause) — циановый акцент вместо приглушённого. */
  primary?: boolean;
  /** Залипший тоггл (напр. включённый mute) — постоянная заливка. */
  pressed?: boolean;
}

/**
 * Транспорт-кнопка плеера: плоская (без «вдавливания», в отличие от Button) —
 * чтобы плотная лента контролов в очереди модерации читалась спокойно.
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
    ? 'text-twitch hover:text-twitch-light hover:bg-surface-2 active:bg-line'
    : pressed
      ? 'bg-surface-2 text-text hover:bg-line'
      : 'text-muted hover:text-text hover:bg-surface-2 active:bg-line disabled:hover:bg-transparent disabled:hover:text-muted';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed || undefined}
      className={`grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-none outline-twitch-light transition-colors duration-75 focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:h-8 sm:w-8 ${tone} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={glyph} />
    </button>
  );
}
