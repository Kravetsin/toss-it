import { useEffect, useState } from 'react';
import type { AdminBotStatus } from '@tmw/shared';
import { getBotStatus } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card } from '@/ui';

/** Chat bot status + reconnect entry point (instead of hand-typing the connect URL). */
export function AdminBotCard() {
  const { t } = useI18n();
  const [status, setStatus] = useState<AdminBotStatus | null>(null);

  useEffect(() => {
    void getBotStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  return (
    <Card className="flex flex-wrap items-center gap-3">
      <span className="flex items-center gap-1.5 text-sm text-text">
        <Icon name="message-circle" size={15} className="text-accent" />
        {t('admin.botTitle')}
      </span>
      {status?.connected ? (
        <span className="flex items-center gap-1.5 text-sm text-ok">
          <Icon name="check" size={14} />
          {t('admin.botConnected', { login: status.login ?? '?' })}
        </span>
      ) : (
        <span className="text-sm text-muted">{t('admin.botDisconnected')}</span>
      )}
      <a href="/api/admin/bot/connect?returnTo=/admin" className="ml-auto">
        <Button variant="secondary" size="sm">
          {status?.connected ? t('admin.botReconnect') : t('admin.botConnect')}
        </Button>
      </a>
    </Card>
  );
}
