import { useCallback } from 'react';
import { useToast } from '@/providers/ToastProvider';

interface ActOptions {
  /** Runs after success (e.g. refetch); may be async. */
  after?: () => void | Promise<unknown>;
  success?: string;
}

/** Wraps a mutation: run -> optional after() -> success toast, errors -> danger toast. */
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
