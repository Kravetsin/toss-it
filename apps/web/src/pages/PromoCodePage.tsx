import { useEffect, useState, type FormEvent } from 'react';
import type { MeResponse } from '@tmw/shared';
import { getMe, redeemPromo } from '../api';
import { Icon } from '../icons';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { Button, Card, Loader } from '../ui';

/** Активация промокода вручную: /promo */
export function PromoCodePage() {
  const { t } = useI18n();
  const toast = useToast();
  const [me, setMe] = useState<MeResponse | null | 'loading'>('loading');
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  // null — ещё не гасили; иначе тип погашенного гранта (для сообщения об успехе).
  const [grant, setGrant] = useState<string | null>(null);

  useEffect(() => {
    void getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  async function activate(e: FormEvent) {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setRedeeming(true);
    try {
      const res = await redeemPromo(c);
      setGrant(res.grant);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
      setRedeeming(false);
    }
  }

  if (me === 'loading') {
    return (
      <Shell>
        <Loader label={t('common.loading')} />
      </Shell>
    );
  }

  // Успех: сообщение зависит от типа гранта (для founder — особое).
  if (grant) {
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <Icon name="sparkles" size={44} className="text-twitch-light" />
          <p className="text-lg">
            {grant === 'founder' ? t('promo.successFounder') : t('promo.success')}
          </p>
          <a href="/dashboard">
            <Button variant="primary">{t('promo.toDashboard')}</Button>
          </a>
        </Card>
      </Shell>
    );
  }

  // Не залогинен — предлагаем войти (после входа вернёмся на /promo).
  if (!me?.user) {
    return (
      <Shell>
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <Icon name="sparkles" size={44} className="text-twitch-light" />
          <p className="text-lg">{t('promo.title')}</p>
          <p className="text-sm text-muted">{t('promo.loginToActivate')}</p>
          <div className="flex flex-col items-center gap-2">
            <a href="/api/auth/login?returnTo=/promo">
              <Button variant="primary">{t('common.loginTwitch')}</Button>
            </a>
            <a href="/api/auth/google/login?returnTo=/promo">
              <Button>{t('common.loginGoogle')}</Button>
            </a>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="flex flex-col items-center gap-4 py-10 text-center">
        <Icon name="sparkles" size={44} className="text-twitch-light" />
        <p className="text-lg">{t('promo.title')}</p>
        <form onSubmit={(e) => void activate(e)} className="flex w-full max-w-xs flex-col items-stretch gap-2">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('promo.enterCode')}
            autoFocus
            className="rounded-none border-2 border-line bg-surface-2 px-3 py-2 text-center font-display uppercase tracking-wide text-text outline-none focus:border-twitch"
          />
          <Button type="submit" variant="primary" disabled={redeeming || !code.trim()}>
            <Icon name="check" size={16} />
            {t('promo.activate')}
          </Button>
        </form>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-xl px-4 py-10">{children}</main>;
}
