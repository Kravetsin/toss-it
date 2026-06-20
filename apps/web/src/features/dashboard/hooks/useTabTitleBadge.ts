import { useEffect } from 'react';

/** Badge counter in browser tab title — visible even when dashboard is in background. */
export function useTabTitleBadge(pendingCount: number) {
  useEffect(() => {
    document.title = (pendingCount > 0 ? `(${pendingCount}) ` : '') + 'Tossit';
    return () => {
      document.title = 'Tossit';
    };
  }, [pendingCount]);
}
