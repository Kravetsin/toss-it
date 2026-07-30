import { useCallback, useEffect, useState } from 'react';
import type { AdminOverlayRow } from '@tmw/shared';
import { listOverlays, reloadOverlaySocket, reloadOverlaysOfKind } from '@/lib/api';
import { useApiAction } from '@/hooks/useApiAction';
import { useToast } from '@/providers/ToastProvider';
import { useI18n } from '@/i18n';
import { Button, Card, IconButton } from '@/ui';
import { Icon } from '@/ui/icons';

/**
 * Connected OBS sources, one row each. A reload reaches a CONNECTED socket only — it rolls a new
 * bundle out or un-wedges a stuck source; an overlay that dropped revives itself (see the overlay's
 * own recovery ladder). Hence the build stamp: it is what says who still needs the push.
 */
export function AdminOverlaysPanel() {
  const { t } = useI18n();
  const act = useApiAction();
  const toast = useToast();
  const [rows, setRows] = useState<AdminOverlayRow[]>([]);
  /** The bulk button is armed by the first click and fires on the second. */
  const [armed, setArmed] = useState(false);

  const refresh = useCallback(() => {
    void listOverlays()
      .then(setRows)
      .catch(() => {});
  }, []);
  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  // Newest stamp among connected sources = what a fresh bundle looks like right now; anything else
  // is running older code. Stamps sort lexicographically ('YYYY-MM-DD HH:mm').
  const newest = rows.reduce<string | null>(
    (a, r) => (r.build && r.build > (a ?? '') ? r.build : a),
    null,
  );
  const chatCount = rows.filter((r) => r.kind === 'chat').length;

  const since = (at: number): string => {
    const min = Math.max(0, Math.round((Date.now() - at) / 60_000));
    return min >= 60
      ? t('ovl.hm', { h: Math.floor(min / 60), m: min % 60 })
      : t('ovl.m', { m: min });
  };

  const one = (row: AdminOverlayRow) =>
    void act(
      async () => {
        await reloadOverlaySocket(row.socketId);
      },
      { success: t('ovl.reloaded'), after: refresh },
    );

  const all = () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    void reloadOverlaysOfKind('chat')
      .then((r) => {
        toast(t('ovl.done', { n: r.reloaded }));
        refresh();
      })
      .catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'danger'));
  };

  return (
    <Card className="flex flex-col gap-3">
      <span className="flex items-center gap-2 text-sm text-text">
        <Icon name="monitor" size={16} />
        {t('ovl.title')}
        <span className="text-muted">({rows.length})</span>
      </span>
      <p className="text-xs text-muted">{t('ovl.hint')}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">{t('ovl.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((r) => (
            <li key={r.socketId} className="flex flex-wrap items-center gap-2">
              <Icon name={r.kind === 'chat' ? 'message-circle' : 'monitor'} size={14} />
              <b>{r.displayName}</b>
              {r.login && <span className="text-muted">@{r.login}</span>}
              <span className="label-mono text-faint">{since(r.connectedAt)}</span>
              {r.transport !== 'websocket' && (
                <span className="label-mono text-warn">{r.transport}</span>
              )}
              <span className={`label-mono ${r.build === newest ? 'text-faint' : 'text-warn'}`}>
                {r.build ?? t('ovl.old')}
              </span>
              {r.playing && <span className="label-mono text-accent">{t('ovl.playing')}</span>}
              <IconButton
                name="reload"
                label={t('ovl.reload')}
                onClick={() => one(r)}
                wrapClassName="ml-auto"
              />
            </li>
          ))}
        </ul>
      )}
      {chatCount > 0 && (
        <Button variant={armed ? 'danger' : 'primary'} onClick={all} className="self-start">
          <Icon name="reload" size={16} />
          {armed ? t('ovl.confirm') : t('ovl.reloadChat', { n: chatCount })}
        </Button>
      )}
    </Card>
  );
}
