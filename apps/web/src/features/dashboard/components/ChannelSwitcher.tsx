import type { AccessibleChannel } from '@tmw/shared';
import { useI18n } from '@/i18n';

/** Переключатель канала (когда их несколько) + чип роли модератора. */
export function ChannelSwitcher({
  list,
  current,
  channelId,
  onSelect,
}: {
  list: AccessibleChannel[];
  current: AccessibleChannel;
  channelId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  if (!(list.length > 1 || current.role === 'moderator')) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      {list.length > 1 ? (
        <>
          <span className="text-muted">{t('dash.channel')}:</span>
          <select
            value={channelId ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            className="rounded-none border-2 border-line bg-surface-2 px-2 py-1 text-text outline-none focus:border-twitch"
          >
            {list.map((c) => (
              <option key={c.channelId} value={c.channelId}>
                {c.displayName}
                {c.role === 'moderator' ? ` — ${t('dash.roleModerator')}` : ''}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="text-muted">{current.displayName}</span>
      )}
      {current.role === 'moderator' && (
        <span className="border border-twitch/40 bg-twitch/15 px-2 py-0.5 text-xs text-twitch-light">
          {t('dash.roleModerator')}
        </span>
      )}
    </div>
  );
}
