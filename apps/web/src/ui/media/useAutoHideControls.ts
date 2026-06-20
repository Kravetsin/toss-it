import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_MS = 3000;

/**
 * Авто-скрытие контролов плеера (как в Telegram): пока `active` (идёт воспроизведение и не
 * открыто меню) — прячем панель через 3 с бездействия; `show()` (по движению мыши/фокусу)
 * показывает снова и перезапускает таймер. Когда `active=false` (пауза, буферизация,
 * открытое меню) — панель всегда видима.
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
