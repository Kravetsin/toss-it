import { useEffect, useState } from 'react';
import type { IntegrationStatus } from '@tmw/shared';
import { connectDonatello, disconnectDonatello, getIntegrations } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card, Input } from '@/ui';

/**
 * Интеграции канала. Donatello: донаты с сервиса стримера запускают всплеск на оверлее
 * (деньги через нас НЕ идут — только слушаем события). Прозрачность: токен вводится честно,
 * статус показывается сразу; невалидный токен — явная ошибка, а не тихий сбой.
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
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      setDonatello(await connectDonatello(channelId, token.trim()));
      setToken('');
    } catch {
      setError(t('dash.donatelloInvalid'));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await disconnectDonatello(channelId);
      setDonatello(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-display">
        <Icon name="gift" size={16} className="text-accent" />
        {t('dash.integrations')}
      </h3>
      <p className="text-sm text-muted">{t('dash.integrationsDonatelloDesc')}</p>

      {donatello?.connected ? (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-sm text-ok">
            <Icon name="check" size={14} />
            {t('dash.donatelloConnected', { name: donatello.name ?? 'Donatello' })}
          </span>
          <Button variant="ghost" size="sm" onClick={() => void disconnect()} disabled={busy}>
            {t('dash.donatelloDisconnect')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={t('dash.donatelloTokenPlaceholder')}
          />
          <p className="text-xs text-muted">{t('dash.donatelloHint')}</p>
          <Button
            variant="primary"
            onClick={() => void connect()}
            disabled={busy || !token.trim()}
          >
            {t('dash.donatelloConnect')}
          </Button>
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}

      <Button variant="secondary" className="justify-center" onClick={onTestDonation}>
        <Icon name="sparkles" size={15} />
        {t('dash.testDonation')}
      </Button>
    </Card>
  );
}
