import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';

/**
 * Post-redirect toasts: the server appends ?dustClaimed=N when chat-bot dust
 * accrued before signup was credited, and ?twitchLinked=1 after a successful
 * Twitch link. Renders nothing.
 */
export function DustClaimedToast() {
  const toast = useToast();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  // Guard against StrictMode's doubled effect firing the toasts twice.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const n = Number(params.get('dustClaimed'));
    const claimed = Number.isInteger(n) && n > 0;
    const linked = params.get('twitchLinked') === '1';
    if (!claimed && !linked) return;
    fired.current = true;
    if (linked) toast(t('toast.twitchLinked'), 'ok');
    if (claimed) toast(t('toast.dustClaimed', { n }), 'ok');
    const next = new URLSearchParams(params);
    next.delete('dustClaimed');
    next.delete('twitchLinked');
    setParams(next, { replace: true });
  }, [params, setParams, toast, t]);

  return null;
}
