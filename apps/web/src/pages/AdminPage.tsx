import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminPromoCode } from '@tmw/shared';
import { listPromoCodes } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Accordion, Loader, PageShell } from '@/ui';
import { StatusCard } from '@/components/StatusCard';
import { PromoGenerateForm } from '@/features/admin/components/PromoGenerateForm';
import { PromoCodeList } from '@/features/admin/components/PromoCodeList';
import { AdminBotCard } from '@/features/admin/components/AdminBotCard';
import { AdminUsersPanel } from '@/features/admin/components/AdminUsersPanel';
import { AdminExclusionsPanel } from '@/features/admin/components/AdminExclusionsPanel';
import { AdminLivePanel } from '@/features/admin/components/AdminLivePanel';
import { AdminCosmeticsPanel } from '@/features/admin/components/AdminCosmeticsPanel';

/** Admin panel for promo codes (only for ADMIN_USER_IDS). */
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
          <Link to="/" className="inline-flex items-center gap-1 text-accent underline">
            <Icon name="arrow-left" size={14} />
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

      <div className="flex flex-col gap-3">
        <AdminBotCard />
        <AdminLivePanel />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Accordion title={t('admin.promoSection', { n: codes.length })} icon="gift">
          <PromoGenerateForm onCreated={refresh} />
          <PromoCodeList codes={codes} onChanged={refresh} />
        </Accordion>
        <Accordion title={t('excl.section')} icon="user-x">
          <AdminExclusionsPanel />
        </Accordion>
        <Accordion title={t('admin.cosmeticsSection')} icon="sparkles">
          <AdminCosmeticsPanel />
        </Accordion>
      </div>

      <AdminUsersPanel />
    </PageShell>
  );
}
