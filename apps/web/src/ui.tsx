import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-twitch hover:bg-twitch-dark text-white font-semibold shadow-[0_0_20px_rgba(145,70,255,0.25)]',
  secondary: 'bg-surface-2 hover:bg-line text-text',
  danger: 'bg-danger/15 hover:bg-danger/30 text-danger',
  ghost: 'bg-transparent hover:bg-surface-2 text-muted hover:text-text',
};

export function Button({
  variant = 'secondary',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`cursor-pointer rounded-lg px-4 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${buttonVariants[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      {children}
    </section>
  );
}

export function Alert({
  tone,
  children,
}: {
  tone: 'ok' | 'warn' | 'danger';
  children: ReactNode;
}) {
  const tones = {
    ok: 'border-ok/30 bg-ok/10 text-ok',
    warn: 'border-warn/30 bg-warn/10 text-warn',
    danger: 'border-danger/30 bg-danger/10 text-danger',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>
  );
}

export function ProgressBar({ value }: { value: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
      {value === null ? (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-twitch-light" />
      ) : (
        <div
          className="h-full rounded-full bg-twitch transition-[width] duration-200"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      )}
    </div>
  );
}

export function Avatar({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        style={{ width: size, height: size }}
        className="rounded-full border border-line"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className="flex items-center justify-center rounded-full bg-twitch/30 font-bold text-twitch-light"
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
