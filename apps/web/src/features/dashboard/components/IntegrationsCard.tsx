import { useEffect, useState } from 'react';
import type { IntegrationStatus } from '@tmw/shared';
import { connectDonatello, disconnectDonatello, getIntegrations } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card, CopyableLinkBox } from '@/ui';

/**
 * Donatello integration via webhooks: Donatello POSTs donations to our callback URL
 * (money bypasses us). Streamer enables callback and enters generated URL + Key. Test button simulates effect locally.
 */
export function IntegrationsCard({
  channelId,
  onTestDonation,
}: {
  channelId: string;
  onTestDonation: () => void;
}) {
  const { t } = useI18n();
  const [donatello, setDonatello] = useState<IntegrationStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'url' | 'key' | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getIntegrations(channelId)
      .then((list) => {
        if (!cancelled) setDonatello(list.find((i) => i.provider === 'donatello') ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  const connect = async () => {
    setBusy(true);
    try {
      setDonatello(await connectDonatello(channelId));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectDonatello(channelId);
      setDonatello(null);
    } finally {
      setBusy(false);
    }
  };

  const copy = (field: 'url' | 'key', value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(field);
    window.setTimeout(() => setCopied((c) => (c === field ? null : c)), 1500);
  };

  const connected = !!donatello?.connected && !!donatello.key;

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-display">
        <Icon name="gift" size={16} className="text-accent" />
        {t('dash.integrations')}
      </h3>
      <p className="text-sm text-muted">{t('dash.integrationsDonatelloDesc')}</p>

      {connected ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">{t('dash.donatelloSteps')}</p>
          <span className="label-mono text-faint">{t('dash.donatelloUrlLabel')}</span>
          <CopyableLinkBox
            value={donatello.callbackUrl ?? ''}
            copied={copied === 'url'}
            onCopy={() => copy('url', donatello.callbackUrl ?? '')}
          />
          <span className="label-mono text-faint">{t('dash.donatelloKeyLabel')}</span>
          <CopyableLinkBox
            value={donatello.key ?? ''}
            secret
            copied={copied === 'key'}
            onCopy={() => copy('key', donatello.key ?? '')}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-sm text-ok">
              <Icon name="check" size={14} />
              {t('dash.donatelloReady')}
            </span>
            <Button variant="ghost" size="sm" onClick={() => void disconnect()} disabled={busy}>
              {t('dash.donatelloDisconnect')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="primary" onClick={() => void connect()} disabled={busy}>
          {t('dash.donatelloConnect')}
        </Button>
      )}

      <Button variant="secondary" className="justify-center" onClick={onTestDonation}>
        <Icon name="sparkles" size={15} />
        {t('dash.testDonation')}
      </Button>
    </Card>
  );
}
