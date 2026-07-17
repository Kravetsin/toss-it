import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';

export interface SelectOption {
  value: string;
  label: string;
}

/** Fixed-position placement for the popover list (portaled to body to escape overflow clipping). */
interface ListPos {
  left: number;
  top: number;
  width: number;
  /** Open upward when there's not enough viewport space below the button. */
  up: boolean;
}

const LIST_MAX_H = 256; // matches max-h-64

/**
 * Themed select (native can't be styled): button + popover list.
 * The list renders in a body portal — ancestors with overflow:hidden (cards, the
 * compose Vessel) would clip an absolutely-positioned dropdown otherwise.
 * Closes on Escape and outside click; height matches Input.
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
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<ListPos | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const up = window.innerHeight - r.bottom < LIST_MAX_H + 8 && r.top > LIST_MAX_H + 8;
      setPos({ left: r.left, top: up ? r.top - 4 : r.bottom + 4, width: r.width, up });
    };
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    // capture: true also catches scrolls of inner scroll containers (e.g. the drawer body).
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
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
      {open &&
        pos &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: pos.width,
              transform: pos.up ? 'translateY(-100%)' : undefined,
            }}
            // Above the z-[70] modals: the list is portaled to body, so a lower layer would
            // render it *behind* whatever dialog opened it.
            className="glass glass-strong z-[80] max-h-64 overflow-auto border border-glass-border p-1 shadow-3"
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
          </ul>,
          document.body,
        )}
    </div>
  );
}
