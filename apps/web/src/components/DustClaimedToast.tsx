import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';

/**
 * Post-login "you found N dust" moment: the server appends ?dustClaimed=N when
 * chat-bot dust accrued before signup was credited. Renders nothing.
 */
export function DustClaimedToast() {
  const toast = useToast();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  // Guard against StrictMode's doubled effect firing the toast twice.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const n = Number(params.get('dustClaimed'));
    if (!Number.isInteger(n) || n <= 0) return;
    fired.current = true;
    toast(t('toast.dustClaimed', { n }), 'ok');
    const next = new URLSearchParams(params);
    next.delete('dustClaimed');
    setParams(next, { replace: true });
  }, [params, setParams, toast, t]);

  return null;
}
