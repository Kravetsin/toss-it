import { useState } from 'react';

/**
 * Уважение системной настройки «уменьшить движение». Считывается однократно
 * (без подписки на изменения) — для одноразового выбора анимация/статика.
 */
export function useReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  return reduced;
}
