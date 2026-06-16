import type { ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

// Жёсткая offset-тень «проваливается» при нажатии (active) — эффект кнопки автомата.
const press = 'active:translate-x-[2px] active:translate-y-[2px] active:shadow-none';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: `bg-twitch hover:bg-twitch-light text-[#06323b] border-twitch-dark shadow-[2px_2px_0_0_var(--color-twitch-dark)] ${press}`,
  secondary: `bg-surface-2 hover:bg-line text-text border-line shadow-pixel-sm ${press}`,
  danger: `bg-danger hover:bg-[#ff6675] text-[#1a0508] border-[#c2303d] shadow-pixel-sm ${press}`,
  ghost: 'bg-transparent hover:bg-surface-2 text-muted hover:text-text border-transparent hover:border-line',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex cursor-pointer items-center gap-2 rounded-none border-2 px-3 py-1.5 font-body text-sm font-semibold uppercase tracking-wide transition-[transform,box-shadow,background-color] duration-75 outline-twitch-light focus-visible:outline-2 focus-visible:outline-offset-2 disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${buttonVariants[variant]} ${className}`}
      {...rest}
    />
  );
}
