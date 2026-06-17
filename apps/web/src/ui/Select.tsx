import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * Кастомный селект (нативный нельзя стилизовать под тему): кнопка + поповер-список.
 * Закрытие по Escape и клику снаружи; высота как у Input (px-3 py-2 text-sm).
 */
export function Select({
  value,
  onChange,
  options,
  label,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** aria-label кнопки. */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-[border-color,box-shadow] duration-[180ms] ease-out hover:border-border-strong focus-visible:[box-shadow:var(--shadow-focus)] aria-expanded:border-accent"
      >
        <span className="truncate">{current?.label ?? ''}</span>
        <Icon
          name="play"
          size={12}
          className={`shrink-0 text-muted transition-transform duration-[var(--dur-fast)] ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && (
        <ul
          role="listbox"
          className="glass glass-strong absolute left-0 right-0 z-40 mt-1 max-h-64 overflow-auto border border-glass-border p-1 shadow-3"
        >
          {options.map((o) => {
            const active = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm outline-none transition-colors duration-[var(--dur-fast)] focus-visible:bg-surface-2 ${
                    active ? 'bg-accent-soft text-accent' : 'text-text hover:bg-surface-2'
                  }`}
                >
                  <span className="truncate">{o.label}</span>
                  {active && <Icon name="check" size={14} className="shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
