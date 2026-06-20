import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copy to clipboard with a temporary per-key "copied" flag; multiple buttons
 * share one hook via `copiedKey` (key defaults to 'default' for a single button).
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
