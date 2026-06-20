import { TEXT_MAX_LEN, type PublicChannelInfo } from '@tmw/shared';
import { formatDuration, useI18n } from '@/i18n';
import { mb } from '@/lib/format';
import { PLATFORM_ICON, PLATFORM_LABEL } from '@/lib/social';
import { Icon } from '@/ui/icons';
import { Avatar, Badge, Chip, Tooltip } from '@/ui';

/** Шапка канала: аватар, имя, бейдж первопроходца и чипы лимитов. */
export function ChannelHeader({ channel }: { channel: PublicChannelInfo }) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex items-center gap-4">
        <Avatar url={channel.avatarUrl} name={channel.displayName} size={56} />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1>{channel.displayName}</h1>
            {channel.isFounder && (
              <Badge>
                <Icon name="sparkles" size={12} />
                {t('badge.founder')}
              </Badge>
            )}
          </div>
          <p className="text-muted">{channel.description || t('channel.subtitle')}</p>
        </div>
      </div>

      {channel.links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {channel.links.map((link, i) => (
            <Tooltip
              key={`${link.platform}-${i}`}
              content={PLATFORM_LABEL[link.platform]}
              focusable={false}
            >
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                aria-label={PLATFORM_LABEL[link.platform]}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-2 text-muted transition-colors hover:border-accent hover:text-accent"
              >
                <Icon name={PLATFORM_ICON[link.platform]} size={18} />
              </a>
            </Tooltip>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip icon="image" text={t('channel.limitVideo', { dur: formatDuration(channel.maxDurationMs, t) })} />
        <Chip icon="volume-2" text={t('channel.limitAudio', { dur: formatDuration(channel.maxAudioDurationMs, t) })} />
        <Chip icon="save" text={t('channel.limitSize', { mb: mb(channel.maxFileSizeBytes) })} />
        <Chip icon="send" text={t('channel.limitText', { n: TEXT_MAX_LEN })} />
      </div>
    </>
  );
}
