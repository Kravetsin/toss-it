import { useCallback, useEffect, useState } from 'react';
import type { MeResponse } from '@tmw/shared';
import { getMe } from '@/lib/api';

/**
 * Загрузка текущей сессии (getMe) с флагом загрузки и ручным refresh.
 * Единый источник правды для всех страниц, которым нужен пользователь.
 */
export function useMe() {
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

  return { me, loading, refresh };
}
