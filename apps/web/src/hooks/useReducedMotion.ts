import { useState } from 'react';

/** Read once at mount; no media-query subscription (one-shot animate/static choice). */
export function useReducedMotion(): boolean {
  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  return reduced;
}
