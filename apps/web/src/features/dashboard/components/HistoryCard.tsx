import type { HistoryEntry } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card } from '@/ui';
import { STATUS_ICON } from '../constants';

/** История показов: таблица заявок со статусом и кнопкой бана отправителя. */
export function HistoryCard({
  history,
  bannedIds,
  onBan,
}: {
  history: HistoryEntry[];
  bannedIds: Set<string>;
  onBan: (userId: string, name: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <h2 className="mb-3 mt-8">{t('dash.history')}</h2>
      {history.length === 0 ? (
        <p className="text-sm text-muted">{t('dash.historyEmpty')}</p>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {history.map((h) => {
                const si = STATUS_ICON[h.status];
                return (
                  <tr key={h.id} className="border-t border-border first:border-t-0">
                    <td className="py-1.5 pr-2 align-middle">
                      <Icon name={si.icon} size={15} className={si.cls} />
                    </td>
                    <td className="py-1.5 pr-3 align-middle">
                      <b className="text-text">{h.senderName ?? t('common.anon')}</b>
                    </td>
                    <td className="py-1.5 pr-3 align-middle label-mono text-faint">{h.kind}</td>
                    <td className="w-full whitespace-nowrap py-1.5 pr-2 text-right align-middle text-xs text-muted">
                      {new Date(h.createdAt).toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right align-middle">
                      {h.senderUserId && !bannedIds.has(h.senderUserId) && (
                        <button
                          onClick={() => onBan(h.senderUserId!, h.senderName ?? t('dash.thisSender'))}
                          className="cursor-pointer text-muted hover:text-danger"
                          title={t('dash.ban')}
                        >
                          <Icon name="user-x" size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
