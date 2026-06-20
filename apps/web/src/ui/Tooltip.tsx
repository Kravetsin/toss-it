import { useId, useState, type ReactNode } from 'react';

/**
 * Лёгкий тултип-пояснение для функционала. Показывается по наведению И фокусу (a11y),
 * содержимое — произвольный ReactNode. Позиционируется под триггером; `align` управляет
 * горизонтальной привязкой (для элементов у края экрана — 'end'/'start').
 */
export function Tooltip({
  content,
  children,
  align = 'center',
  className = '',
}: {
  content: ReactNode;
  children: ReactNode;
  align?: 'center' | 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const pos =
    align === 'end'
      ? 'right-0'
      : align === 'start'
        ? 'left-0'
        : 'left-1/2 -translate-x-1/2';

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        tabIndex={0}
        aria-describedby={open ? id : undefined}
        className="inline-flex rounded-full outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
      >
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          id={id}
          className={`absolute top-full z-50 mt-2 ${pos} w-max max-w-[16rem] rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 text-left text-xs leading-relaxed text-muted shadow-2`}
        >
          {content}
        </span>
      )}
    </span>
  );
}
