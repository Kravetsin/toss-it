import { useEffect, type ReactNode } from 'react';
import { IconButton } from './IconButton';

/**
 * Выезжающая панель (slide-over справа) — для тяжёлого контента вне основного
 * потока (настройки, история). Backdrop-клик и Escape закрывают, скролл body
 * блокируется. Анимация slide уважает prefers-reduced-motion (глобальное правило
 * в index.css гасит длительность). z-[60] — выше LanguageSwitcher (z-50).
 */
export function Drawer({
  open,
  onClose,
  title,
  closeLabel,
  width = 'max-w-md',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  closeLabel: string;
  /** Tailwind max-w-* класс панели. */
  width?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-[60] overflow-hidden ${open ? '' : 'pointer-events-none'}`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-[var(--dur)] ease-out ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        aria-hidden={!open}
        className={`glass glass-strong absolute inset-y-0 right-0 flex w-full ${width} flex-col border-l border-glass-border shadow-4 transition-transform duration-[var(--dur)] ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="label-mono text-muted">{title}</h2>
          <IconButton name="close" label={closeLabel} variant="ghost" size="sm" onClick={onClose} />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
