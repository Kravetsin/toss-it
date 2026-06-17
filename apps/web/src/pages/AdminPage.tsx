import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminPromoCode } from '@tmw/shared';
import { listPromoCodes } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Loader, PageShell } from '@/ui';
import { StatusCard } from '@/components/StatusCard';
import { PromoGenerateForm } from '@/features/admin/components/PromoGenerateForm';
import { PromoCodeList } from '@/features/admin/components/PromoCodeList';

/** Админка промокодов первопроходца: /admin (только для ADMIN_USER_IDS). */
export function AdminPage() {
  const { t } = useI18n();
  const { me, loading } = useMe();
  const [codes, setCodes] = useState<AdminPromoCode[]>([]);
  const isAdmin = !!me?.user?.isAdmin;

  const refresh = useCallback(() => {
    void listPromoCodes()
      .then(setCodes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin, refresh]);

  if (loading) {
    return (
      <PageShell maxWidth="3xl">
        <Loader label={t('common.loading')} />
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell maxWidth="3xl">
        <StatusCard icon="square-alert" iconSize={40} tone="warn" gap={3}>
          <p className="text-muted">{t('admin.denied')}</p>
          <Link to="/" className="text-accent underline">
            {t('common.home')}
          </Link>
        </StatusCard>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2">
          <Icon name="sparkles" size={26} className="text-accent" />
          {t('admin.title')}
        </h1>
        <Link to="/dashboard" className="text-sm text-muted hover:text-text">
          {t('dash.title')}
        </Link>
      </div>

      <PromoGenerateForm onCreated={refresh} />
      <PromoCodeList codes={codes} />
    </PageShell>
  );
}
