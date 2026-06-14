import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

// Жёсткая offset-тень «проваливается» при нажатии (active) — эффект кнопки автомата.
const press = 'active:translate-x-[3px] active:translate-y-[3px] active:shadow-none';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: `bg-twitch hover:bg-twitch-light text-white border-twitch-dark shadow-[3px_3px_0_0_var(--color-twitch-dark)] [text-shadow:1px_1px_0_rgba(0,0,0,0.5)] ${press}`,
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
      className={`inline-flex cursor-pointer items-center gap-2 rounded-none border-2 px-4 py-2 font-display text-sm uppercase tracking-wide transition-[transform,box-shadow,background-color] duration-75 outline-twitch-light focus-visible:outline-2 focus-visible:outline-offset-2 disabled:translate-x-0 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none ${buttonVariants[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Card({
  children,
  className = '',
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section
      className={`rounded-none border-[3px] border-line bg-surface p-5 ${accent ? 'card-pixel-accent' : 'card-pixel'} ${className}`}
    >
      {children}
    </section>
  );
}

export function Alert({ tone, children }: { tone: 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  const tones = {
    ok: 'border-ok text-ok bg-[color-mix(in_srgb,var(--color-ok)_12%,var(--color-surface))]',
    warn: 'border-warn text-warn bg-[color-mix(in_srgb,var(--color-warn)_12%,var(--color-surface))]',
    danger: 'border-danger text-danger bg-[color-mix(in_srgb,var(--color-danger)_14%,var(--color-surface))]',
  };
  return (
    <div className={`flex items-center gap-2 rounded-none border-[3px] border-l-[6px] px-4 py-3 ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function ProgressBar({ value }: { value: number | null }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-none border-2 border-line bg-surface-2">
      {value === null ? (
        <div className="progress-indeterminate h-full w-1/3 bg-twitch-light" />
      ) : (
        <div
          className="h-full bg-twitch transition-[width] duration-200 [box-shadow:inset_-2px_0_0_var(--color-twitch-dark)]"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      )}
    </div>
  );
}

export function Avatar({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  // Аватар — единственное исключение из «всё квадратное»: оставляем круг-«монету».
  const frame = 'rounded-full border-[3px] border-line shadow-pixel-sm [image-rendering:pixelated]';
  if (url) {
    return <img src={url} alt={name} style={{ width: size, height: size }} className={frame} />;
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className={`flex items-center justify-center bg-twitch/30 font-display font-bold text-twitch-light ${frame}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
