import type { AccessibleChannel } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Badge, Select } from '@/ui';

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
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {list.length > 1 ? (
        <>
          <span className="label-mono text-muted">{t('dash.channel')}</span>
          <Select
            value={channelId ?? ''}
            onChange={onSelect}
            label={t('dash.channel')}
            className="w-52"
            options={list.map((c) => ({
              value: c.channelId,
              label:
                c.displayName + (c.role === 'moderator' ? ` — ${t('dash.roleModerator')}` : ''),
            }))}
          />
        </>
      ) : (
        <span className="text-muted">{current.displayName}</span>
      )}
      {current.role === 'moderator' && <Badge>{t('dash.roleModerator')}</Badge>}
    </div>
  );
}
