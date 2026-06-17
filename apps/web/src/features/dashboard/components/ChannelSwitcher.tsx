import type { AccessibleChannel } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui';

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
          <span className="label-mono text-muted">{t('dash.channel')}</span>
          <select
            value={channelId ?? ''}
            onChange={(e) => onSelect(e.target.value)}
            className="rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-text outline-none transition-[border-color,box-shadow] duration-[180ms] ease-out focus:border-accent focus:[box-shadow:var(--shadow-focus)]"
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
      {current.role === 'moderator' && <Badge>{t('dash.roleModerator')}</Badge>}
    </div>
  );
}
