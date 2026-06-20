import { useState } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Gate fidget animations on perf budget: not reduced-motion, fine pointer, >=4 cores.
 * Capability resolved once (no live re-eval).
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
