import { useEffect } from 'react';

/** Счётчик в заголовке вкладки — виден, даже когда дашборд в фоне. */
export function useTabTitleBadge(pendingCount: number) {
  useEffect(() => {
    document.title = (pendingCount > 0 ? `(${pendingCount}) ` : '') + 'Tossit';
    return () => {
      document.title = 'Tossit';
    };
  }, [pendingCount]);
}
