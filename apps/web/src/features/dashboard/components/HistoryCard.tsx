import type { HistoryEntry } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Tooltip } from '@/ui';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';
import { STATUS_ICON } from '../constants';

/** Submission history table with status and ban button per sender (drawer UI). */
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
  if (history.length === 0) {
    return <p className="text-sm text-muted">{t('dash.historyEmpty')}</p>;
  }
  return (
    <div className="overflow-x-auto">
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
                  <span className="flex items-center gap-1.5">
                    <b
                      className="text-text"
                      style={h.senderColor ? { color: h.senderColor } : undefined}
                    >
                      {h.senderName ?? t('common.anon')}
                    </b>
                    <PlatformIcon userId={h.senderUserId} size={13} />
                    <UserBadges isFounder={h.isFounder} variant="icons" />
                  </span>
                </td>
                <td className="py-1.5 pr-3 align-middle label-mono text-faint">{h.kind}</td>
                <td className="w-full whitespace-nowrap py-1.5 pr-2 text-right align-middle text-xs text-muted">
                  {new Date(h.createdAt).toLocaleString()}
                </td>
                <td className="py-1.5 text-right align-middle">
                  {h.senderUserId && !bannedIds.has(h.senderUserId) && (
                    <Tooltip content={t('dash.ban')} align="end" focusable={false}>
                      <button
                        onClick={() => onBan(h.senderUserId!, h.senderName ?? t('dash.thisSender'))}
                        className="cursor-pointer text-muted hover:text-danger"
                      >
                        <Icon name="user-x" size={16} />
                      </button>
                    </Tooltip>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
