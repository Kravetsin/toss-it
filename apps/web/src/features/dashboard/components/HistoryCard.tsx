import { LEVEL_GLOW_FROM, levelTier, toRoman, type HistoryEntry } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { LinkedText, Tooltip } from '@/ui';
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
            const nick = nickProps({
              color: h.senderColor,
              color2: h.senderColor2,
              flow: h.senderNickFlow,
              effect: h.senderEffect,
            });
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
                    <b className={`text-text ${nick.className}`} style={nick.style}>
                      {h.senderName ?? t('common.anon')}
                    </b>
                    <PlatformIcon userId={h.senderUserId} size={13} />
                    <UserBadges isFounder={h.isFounder} variant="icons" />
                  </span>
                </td>
                <td className="py-1.5 pr-3 align-middle label-mono text-faint">{h.kind}</td>
                {/* max-w-0 + w-full: the message takes the leftover width and clamps instead of
                    stretching the row — the link inside stays clickable. */}
                <td className="w-full max-w-0 py-1.5 pr-3 align-middle">
                  {h.text && (
                    <p className="line-clamp-2 select-text break-words text-xs text-muted">
                      <LinkedText text={h.text} />
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right align-middle text-xs text-muted">
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
