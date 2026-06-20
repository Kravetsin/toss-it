import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/ui/icons';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Универсальная модальная оболочка: портал в `body`, затемнённый фон с блюром, появление/
 * уход (fade), Esc, блокировка прокрутки страницы и кнопка ✕. Содержимое и семантика клика
 * по нему — за вызывающим (картинки закрываются кликом по себе, видео — переключает play).
 * Закрытие по фону: только прямой клик по тёмной подложке (`e.target === e.currentTarget`),
 * клики, всплывшие от детей (видео/контролы), не закрывают.
 */
export function ModalPortal({
  open,
  onClose,
  ariaLabel,
  closeOnBackdrop = true,
  showClose = true,
  className = '',
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel?: string;
  closeOnBackdrop?: boolean;
  showClose?: boolean;
  className?: string;
  children: ReactNode;
}) {
  // render — в DOM ли (держим на время exit-анимации); shown — целевое видимое состояние.
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setRender(true);
      return;
    }
    setShown(false);
    const t = setTimeout(() => setRender(false), 200);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!render || !open) return;
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [render, open]);

  // Esc закрывает; Tab держим внутри модалки (focus-trap для aria-modal); пока открыт —
  // блокируем скролл страницы под модалкой.
  useEffect(() => {
    if (!render) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const c = containerRef.current;
      if (!c) return;
      const items = Array.from(c.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const a = document.activeElement;
      if (!c.contains(a)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && a === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && a === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [render, onClose]);

  if (!render) return null;

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
      className={`fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-bg/80 p-6 backdrop-blur-sm transition-opacity duration-200 ease-out ${
        shown ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    >
      {children}
      {showClose && (
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 inline-flex size-9 items-center justify-center rounded-full border border-border bg-surface text-muted outline-none transition-colors duration-[180ms] ease-out hover:border-border-strong hover:text-text focus-visible:[box-shadow:var(--shadow-focus)]"
        >
          <Icon name="close" size={18} />
        </button>
      )}
    </div>,
    document.body,
  );
}
