import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Копирование в буфер с временной отметкой «скопировано» по ключу.
 * Несколько кнопок на странице делят один хук: `copiedKey` указывает, какая
 * последней была скопирована (ключ по умолчанию — для одиночной кнопки).
 */
export function useClipboard(timeout = 2000) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = useCallback(
    (value: string, key = 'default') => {
      void navigator.clipboard.writeText(value);
      setCopiedKey(key);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), timeout);
    },
    [timeout],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return { copiedKey, copy };
}
