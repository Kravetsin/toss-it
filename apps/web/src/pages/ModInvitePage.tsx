import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ModInviteInfo } from '@tmw/shared';
import { acceptModInvite, getModInvite } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { Icon } from '@/ui/icons';
import { Button, Loader, PageShell } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { StatusCard } from '@/components/StatusCard';

/** Страница принятия инвайта в модераторы: /mod-invite/:token */
export function ModInvitePage() {
  const { t } = useI18n();
  const toast = useToast();
  const { token = '' } = useParams();
  const { me, loading: meLoading } = useMe();
  const [info, setInfo] = useState<ModInviteInfo | null | 'loading' | 'invalid'>('loading');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    void getModInvite(token)
      .then(setInfo)
      .catch(() => setInfo('invalid'));
  }, [token]);

  const returnTo = `/mod-invite/${encodeURIComponent(token)}`;

  async function accept() {
    setAccepting(true);
    try {
      const { channelId } = await acceptModInvite(token);
      try {
        localStorage.setItem('tmw_dash_channel', channelId);
      } catch {
        /* приватный режим */
      }
      window.location.href = '/dashboard';
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
      setAccepting(false);
    }
  }

  if (info === 'loading' || meLoading) {
    return (
      <PageShell>
        <Loader label={t('common.loading')} />
      </PageShell>
    );
  }

  if (info === 'invalid' || !info) {
    return (
      <PageShell>
        <StatusCard icon="square-alert" iconSize={40} tone="warn" gap={3}>
          <p className="text-muted">{t('mod.inviteInvalid')}</p>
        </StatusCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <StatusCard icon="shield">
        <p className="text-lg">{t('mod.inviteTitle', { channel: info.channelDisplayName })}</p>
        {me?.user ? (
          <Button variant="primary" disabled={accepting} onClick={() => void accept()}>
            <Icon name="check" size={16} />
            {t('mod.inviteAccept')}
          </Button>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted">{t('mod.inviteLogin')}</p>
            <AuthButtons returnTo={returnTo} />
          </div>
        )}
      </StatusCard>
    </PageShell>
  );
}
