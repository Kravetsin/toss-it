import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MeResponse } from '@tmw/shared';
import { getMe } from '@/lib/api';

export interface MeValue {
  me: MeResponse | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const MeContext = createContext<MeValue | null>(null);

/**
 * Единый источник правды о текущей сессии. И оболочка (AppShell), и страницы
 * читают одного и того же пользователя — без дублирующих getMe и рассинхрона
 * после logout. См. apps/web/REDESIGN.md §7.
 */
export function MeProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(
    () =>
      getMe()
        .then(setMe)
        .catch(() => setMe(null))
        .finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <MeContext.Provider value={{ me, loading, refresh }}>{children}</MeContext.Provider>;
}

export function useMeContext(): MeValue {
  const ctx = useContext(MeContext);
  if (!ctx) throw new Error('useMe must be used within MeProvider');
  return ctx;
}
