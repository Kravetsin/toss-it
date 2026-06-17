import { useState, type FormEvent } from 'react';
import { redeemPromo } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { Icon } from '@/ui/icons';
import { Button, Input, Loader, PageShell } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { StatusCard } from '@/components/StatusCard';

/** Активация промокода вручную: /promo */
export function PromoCodePage() {
  const { t } = useI18n();
  const toast = useToast();
  const { me, loading } = useMe();
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  // null — ещё не гасили; иначе тип погашенного гранта (для сообщения об успехе).
  const [grant, setGrant] = useState<string | null>(null);

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

  if (loading) {
    return (
      <PageShell>
        <Loader label={t('common.loading')} />
      </PageShell>
    );
  }

  // Успех: сообщение зависит от типа гранта (для founder — особое).
  if (grant) {
    return (
      <PageShell>
        <StatusCard icon="sparkles">
          <p className="text-lg">
            {grant === 'founder' ? t('promo.successFounder') : t('promo.success')}
          </p>
          <a href="/dashboard">
            <Button variant="primary">{t('promo.toDashboard')}</Button>
          </a>
        </StatusCard>
      </PageShell>
    );
  }

  // Не залогинен — предлагаем войти (после входа вернёмся на /promo).
  if (!me?.user) {
    return (
      <PageShell>
        <StatusCard icon="sparkles">
          <p className="text-lg">{t('promo.title')}</p>
          <p className="text-sm text-muted">{t('promo.loginToActivate')}</p>
          <AuthButtons returnTo="/promo" />
        </StatusCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <StatusCard icon="sparkles">
        <p className="text-lg">{t('promo.title')}</p>
        <form
          onSubmit={(e) => void activate(e)}
          className="flex w-full max-w-xs flex-col items-stretch gap-2"
        >
          <Input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('promo.enterCode')}
            autoFocus
            className="bg-surface-2 px-3 py-2 text-center font-mono uppercase tracking-wide"
          />
          <Button type="submit" variant="primary" disabled={redeeming || !code.trim()}>
            <Icon name="check" size={16} />
            {t('promo.activate')}
          </Button>
        </form>
      </StatusCard>
    </PageShell>
  );
}
