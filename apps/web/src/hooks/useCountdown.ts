import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Countdown against an absolute deadline: a background tab throttles timers to about one tick a
 * minute (and none at all while the machine sleeps), so a per-tick decrement would lag by however
 * long the tab was away. Ticking recomputes from the deadline, so returning to the tab is exact.
 */
export function useCountdown(): [number, (sec: number) => void] {
  const [sec, setSec] = useState(0);
  const deadline = useRef(0);

  const start = useCallback((s: number) => {
    deadline.current = s > 0 ? Date.now() + s * 1000 : 0;
    setSec(Math.max(0, Math.ceil(s)));
  }, []);

  const running = sec > 0;
  useEffect(() => {
    if (!running) return;
    const tick = () => setSec(Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000)));
    const id = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [running]);

  return [sec, start];
}
