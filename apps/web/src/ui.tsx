import { useEffect, useState } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

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
      className={`rounded-none border-2 border-line bg-surface p-4 ${accent ? 'card-pixel-accent' : 'card-pixel'} ${className}`}
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
    <div className={`flex items-center gap-2 rounded-none border-2 border-l-4 px-3 py-2 ${tones[tone]}`}>
      {children}
    </div>
  );
}

/** Небольшой бейдж-чип (напр. статус «Первопроходец»). Цвет — брендовый cyan. */
export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-twitch/50 bg-twitch/15 px-2 py-0.5 font-body text-xs font-semibold uppercase tracking-wide text-twitch-light ${className}`}
    >
      {children}
    </span>
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

// Брендовый лоадер — «сплит-флэп» табло: ряд плиток-кубиков по очереди
// переворачивается и открывает буквы слова («ЗАГРУЗКА» / «LOADING»), затем так же
// по очереди закрывается — и цикл повторяется. Сколько букв открыто сейчас, держит
// `shown`; саму механику переворота делает CSS-transition по data-on у плитки.
export function Loader({ label }: { label?: string }) {
  // Слово берём из локализованной подписи: убираем многоточие, в верхний регистр.
  const word = (label ?? 'Loading').replace(/[.…\s]+$/u, '').toUpperCase();
  const letters = [...word];
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const n = letters.length;
    if (n === 0) return;
    let count = 0;
    let opening = true; // фаза: открываем буквы или закрываем
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      let delay = 170; // шаг между буквами
      if (opening) {
        count += 1;
        if (count >= n) {
          opening = false;
          delay = 750; // пауза с открытым словом
        }
      } else {
        count -= 1;
        if (count <= 0) {
          opening = true;
          delay = 450; // пауза перед новым кругом
        }
      }
      setShown(count);
      timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 170);
    return () => clearTimeout(timer);
    // letters пересоздаётся каждый рендер, поэтому завязываемся на стабильное word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label ?? 'Loading'}
      className="flex min-h-[50vh] flex-col items-center justify-center gap-5"
    >
      <div className="loader-board" aria-hidden="true">
        {letters.map((ch, i) =>
          ch === ' ' ? (
            <span key={i} className="loader-gap" />
          ) : (
            <span key={i} className="loader-tile" data-on={i < shown}>
              <span className="loader-tile-face loader-tile-front" />
              <span className="loader-tile-face loader-tile-back">{ch}</span>
            </span>
          ),
        )}
      </div>
      {/* Мигающий курсор — живой признак работы даже на паузе с открытым словом. */}
      <span className="pixel-blink font-display text-2xl leading-none text-twitch-light">_</span>
    </div>
  );
}

export function Avatar({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  // Аватар — единственное исключение из «всё квадратное»: оставляем круг-«монету».
  const frame = 'rounded-full border-2 border-line shadow-pixel-sm [image-rendering:pixelated]';
  if (url) {
    return <img src={url} alt={name} style={{ width: size, height: size }} className={frame} />;
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.45 }}
      className={`flex items-center justify-center bg-twitch/30 font-body font-semibold text-twitch-light ${frame}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
