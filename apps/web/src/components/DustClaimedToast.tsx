import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';

/**
 * Post-redirect toasts: the server appends ?dustClaimed=N when chat-bot dust
 * accrued before signup was credited, ?welcomeDust=N for the one-time signup
 * bonus, and ?twitchLinked=1 after a successful Twitch link. The two dust
 * params stay separate because they are different news — one is dust the
 * person earned and is only now collecting, the other is a gift. Renders
 * nothing.
 */
export function DustClaimedToast() {
  const toast = useToast();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  // Guard against StrictMode's doubled effect firing the toasts twice.
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const amount = (key: string) => {
      const n = Number(params.get(key));
      return Number.isInteger(n) && n > 0 ? n : 0;
    };
    const claimed = amount('dustClaimed');
    const welcome = amount('welcomeDust');
    const linked = params.get('twitchLinked') === '1';
    if (!claimed && !welcome && !linked) return;
    fired.current = true;
    if (linked) toast(t('toast.twitchLinked'), 'ok');
    // Welcome first: it is the one that greets, and a new Twitch signup can fire both.
    if (welcome) toast(t('toast.welcomeDust', { n: welcome }), 'ok');
    if (claimed) toast(t('toast.dustClaimed', { n: claimed }), 'ok');
    const next = new URLSearchParams(params);
    next.delete('dustClaimed');
    next.delete('welcomeDust');
    next.delete('twitchLinked');
    setParams(next, { replace: true });
  }, [params, setParams, toast, t]);

  return null;
}
