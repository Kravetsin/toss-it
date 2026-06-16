import { useCallback } from 'react';
import { useToast } from '@/providers/ToastProvider';

interface ActOptions {
  /** Колбэк после успеха (напр. перезагрузка списков). Может быть асинхронным. */
  after?: () => void | Promise<unknown>;
  /** Тост об успехе. */
  success?: string;
}

/**
 * Обёртка «вызвать мутацию → опционально обновить → тост, а на ошибке — тост danger».
 * Заменяет копипасту act() со страниц Dashboard/Home и т.п.
 */
export function useApiAction() {
  const toast = useToast();
  return useCallback(
    async (fn: () => Promise<unknown>, opts?: ActOptions) => {
      try {
        await fn();
        await opts?.after?.();
        if (opts?.success) toast(opts.success);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'danger');
      }
    },
    [toast],
  );
}
