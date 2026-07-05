import { useCallback, useEffect, useState } from 'react';
import type { AdminLiveChannel } from '@tmw/shared';
import { listLiveChannels } from '@/lib/api';
import { useI18n } from '@/i18n';
import { Card } from '@/ui';

/** "Who's live now": channels with a connected OBS overlay. Polls every 15s. */
export function AdminLivePanel() {
  const { t } = useI18n();
  const [rows, setRows] = useState<AdminLiveChannel[]>([]);

  const refresh = useCallback(() => {
    void listLiveChannels()
      .then(setRows)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <Card className="flex flex-col gap-3">
      <span className="flex items-center gap-2 text-sm text-text">
        <span className="relative flex h-2 w-2">
          {rows.length > 0 && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${rows.length > 0 ? 'bg-ok' : 'bg-muted'}`}
          />
        </span>
        {t('live.title')}
        <span className="text-muted">({rows.length})</span>
      </span>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">{t('live.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((r) => (
            <li key={r.login} className="flex items-center gap-3">
              {r.avatarUrl ? (
                <img src={r.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs">
                  {r.displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
              <b>{r.displayName}</b>
              <a
                href={`/c/${encodeURIComponent(r.login)}`}
                target="_blank"
                rel="noreferrer"
                className="text-muted hover:text-accent"
              >
                @{r.login}
              </a>
              {r.overlays > 1 && (
                <span className="label-mono text-faint">
                  {t('live.overlays', { n: r.overlays })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
