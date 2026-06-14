import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './icons';

type Tone = 'ok' | 'warn' | 'danger';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

type ToastFn = (message: string, tone?: Tone) => void;

const ToastContext = createContext<ToastFn | null>(null);

const TONE: Record<Tone, { cls: string; icon: IconName }> = {
  ok: {
    cls: 'border-ok text-ok bg-[color-mix(in_srgb,var(--color-ok)_14%,var(--color-surface))]',
    icon: 'check',
  },
  warn: {
    cls: 'border-warn text-warn bg-[color-mix(in_srgb,var(--color-warn)_14%,var(--color-surface))]',
    icon: 'square-alert',
  },
  danger: {
    cls: 'border-danger text-danger bg-[color-mix(in_srgb,var(--color-danger)_16%,var(--color-surface))]',
    icon: 'close',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback<ToastFn>((message, tone = 'ok') => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 2800);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((it) => (
          <div
            key={it.id}
            className={`toast-in flex items-center gap-2 rounded-none border-[3px] px-4 py-2 font-display text-sm shadow-[4px_4px_0_0_var(--color-bg-shadow)] ${TONE[it.tone].cls}`}
          >
            <Icon name={TONE[it.tone].icon} size={16} />
            {it.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
