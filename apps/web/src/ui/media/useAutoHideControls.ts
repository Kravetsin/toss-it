import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_MS = 3000;

/**
 * Auto-hide player controls (Telegram style): when active, hide panel after 3s idle; show() displays
 * and restarts timer. Panel always visible when inactive (paused/buffering/menu open).
 */
export function useAutoHideControls(active: boolean): { visible: boolean; show: () => void } {
  const [visible, setVisible] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    if (active) timer.current = setTimeout(() => setVisible(false), HIDE_MS);
  }, [active]);

  useEffect(() => {
    if (!active) {
      clearTimeout(timer.current);
      setVisible(true);
      return;
    }
    show();
    return () => clearTimeout(timer.current);
  }, [active, show]);

  return { visible, show };
}
