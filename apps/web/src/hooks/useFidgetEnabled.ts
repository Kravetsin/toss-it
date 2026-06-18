import { useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Включать ли «фиджет»-анимации (курсор-эффекты, частицы, физика). Гейт по перф-бюджету:
 * НЕ reduced-motion, точный указатель (мышь, не тач) и не слишком слабая машина.
 * Решается однократно — без подписки на изменения.
 */
export function useFidgetEnabled(): boolean {
  const reduced = useReducedMotion();
  const [capable] = useState(() => {
    if (typeof window === 'undefined') return false;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const cores = navigator.hardwareConcurrency ?? 4;
    return finePointer && cores >= 4;
  });
  return !reduced && capable;
}
