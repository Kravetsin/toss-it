import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '@/ui/icons';

type Tone = 'ok' | 'warn' | 'danger';
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

type ToastFn = (message: string, tone?: Tone) => void;

const ToastContext = createContext<ToastFn | null>(null);

const TONE: Record<Tone, { icon: string; iconName: IconName }> = {
  ok: { icon: 'text-ok', iconName: 'check' },
  warn: { icon: 'text-warn', iconName: 'square-alert' },
  danger: { icon: 'text-danger', iconName: 'close' },
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
            className="toast-in flex items-center gap-2 rounded-none border border-border bg-surface px-3.5 py-2.5 text-sm font-medium text-text shadow-2"
          >
            <Icon name={TONE[it.tone].iconName} size={16} className={TONE[it.tone].icon} />
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
