import { useEffect, useState } from 'react';
import type { LinkAccountCard, LinkPendingInfo } from '@tmw/shared';
import { getLinkPending, resolveLink } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { Badge, Button, Card, Loader, PageShell } from '@/ui';
import { StatusCard } from '@/components/StatusCard';
import { DustMark } from '@/components/DustMark';

/**
 * "Choose primary account" page: the linked Twitch already opens another Tossit
 * account. Nothing is merged — the chosen account gets both login doors, the
 * other stays intact but unreachable.
 */
export function LinkConfirmPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [info, setInfo] = useState<LinkPendingInfo | 'loading' | 'invalid'>('loading');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getLinkPending()
      .then(setInfo)
      .catch(() => setInfo('invalid'));
  }, []);

  async function choose(primary: 'current' | 'other') {
    setBusy(true);
    try {
      await resolveLink(primary);
      window.location.href = '/?twitchLinked=1';
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
      setBusy(false);
    }
  }

  if (info === 'loading') {
    return (
      <PageShell>
        <Loader label={t('common.loading')} />
      </PageShell>
    );
  }

  if (info === 'invalid') {
    return (
      <PageShell>
        <StatusCard icon="square-alert" iconSize={40} tone="warn" gap={3}>
          <p className="text-muted">{t('link.noPending')}</p>
        </StatusCard>
      </PageShell>
    );
  }

  const accountCard = (acc: LinkAccountCard, key: 'current' | 'other') => (
    <Card className="flex flex-1 flex-col items-center gap-3 text-center">
      <span className="label-mono text-faint">
        {t(key === 'current' ? 'link.currentAccount' : 'link.otherAccount')}
      </span>
      {acc.avatarUrl ? (
        <img src={acc.avatarUrl} alt="" className="h-14 w-14 rounded-full" />
      ) : (
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-xl">
          {acc.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="flex flex-col">
        <b>{acc.displayName}</b>
        <span className="text-sm text-muted">@{acc.login}</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-sm text-muted">
        <DustMark size={14} className="text-accent" />
        <span className="tabular-nums">{acc.stardust}</span>
      </span>
      {acc.ownsChannel && <Badge>{t('link.ownsChannel')}</Badge>}
      <Button variant="primary" disabled={busy} onClick={() => void choose(key)}>
        {t('link.choose')}
      </Button>
    </Card>
  );

  return (
    <PageShell>
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="text-center text-xl">{t('link.confirmTitle')}</h1>
        <p className="text-center text-sm text-muted">{t('link.confirmSubtitle')}</p>
        {(info.current.ownsChannel || info.other.ownsChannel) && (
          <p className="text-center text-sm text-warn">{t('link.loseChannelWarning')}</p>
        )}
        <div className="flex flex-col gap-4 sm:flex-row">
          {accountCard(info.current, 'current')}
          {accountCard(info.other, 'other')}
        </div>
      </div>
    </PageShell>
  );
}
