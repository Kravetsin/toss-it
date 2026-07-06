import { LEVEL_GLOW_FROM, levelTier, toRoman, type HistoryEntry } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Tooltip } from '@/ui';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';
import { nickProps } from '@/lib/nick';
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
            const tier = h.senderLevel ? levelTier(h.senderLevel) : null;
            const levelGlow = !!tier && (h.senderLevel ?? 0) >= LEVEL_GLOW_FROM;
            return (
              <tr key={h.id} className="border-t border-border first:border-t-0">
                <td className="py-1.5 pr-2 align-middle">
                  <Icon name={si.icon} size={15} className={si.cls} />
                </td>
                <td className="py-1.5 pr-3 align-middle">
                  <span className="flex items-center gap-1.5">
                    {tier && (
                      <span
                        className={`shrink-0 text-xs font-bold ${tier.iris ? 'lvl-iris' : ''}`}
                        style={{
                          color: tier.color,
                          textShadow: levelGlow ? `0 0 6px ${tier.color}` : undefined,
                        }}
                      >
                        {toRoman(h.senderLevel!)}
                      </span>
                    )}
                    <b
                      className={`text-text ${nickProps(h.senderColor, h.senderEffect).className}`}
                      style={nickProps(h.senderColor, h.senderEffect).style}
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
