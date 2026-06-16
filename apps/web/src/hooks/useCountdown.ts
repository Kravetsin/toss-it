import { useEffect, useState } from 'react';

/**
 * Обратный отсчёт в секундах: тикает раз в секунду до нуля.
 * Возвращает [текущее значение, установить значение] — установка запускает отсчёт.
 */
export function useCountdown(): [number, (sec: number) => void] {
  const [sec, setSec] = useState(0);

  useEffect(() => {
    if (sec <= 0) return;
    const id = window.setInterval(() => setSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [sec]);

  return [sec, setSec];
}
