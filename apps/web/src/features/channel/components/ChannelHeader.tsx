import { TEXT_MAX_LEN, type PublicChannelInfo } from '@tmw/shared';
import { formatDuration, useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { mb } from '@/lib/format';
import { nickProps } from '@/lib/nick';
import { PLATFORM_ICON, PLATFORM_LABEL } from '@/lib/social';
import { Icon } from '@/ui/icons';
import { Avatar, Badge, Chip, Tooltip } from '@/ui';
import { CardEffect } from '@/components/CardEffect';

export function ChannelHeader({ channel }: { channel: PublicChannelInfo }) {
  const { t } = useI18n();
  const { me } = useMe();
  // The streamer's own cosmetics: nick gets color+glow, the whole header gets the card effect
  // (so a streamer can see their effects even without sending files). When the streamer is
  // viewing their OWN page, read live equipped state from `me` so an equip shows without a reload.
  const mine = me?.user && me.user.login === channel.login ? me.user.equipped : undefined;
  const nickColor = mine ? (mine.nickColor ?? null) : channel.nickColor;
  const nickEffect = mine ? (mine.nickEffect ?? null) : channel.nickEffect;
  const cardEffect = mine ? (mine.cardEffect ?? null) : channel.cardEffect;
  const nick = nickProps(nickColor, nickEffect);
  return (
    <div className="relative">
      <CardEffect effect={cardEffect} />
      <div className="relative">
        <div className="flex items-center gap-4">
          <Avatar url={channel.avatarUrl} name={channel.displayName} size={56} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={nick.className} style={nick.style}>
                {channel.displayName}
              </h1>
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
          <Chip
            icon="image"
            text={t('channel.limitVideo', { dur: formatDuration(channel.maxDurationMs, t) })}
          />
          <Chip
            icon="volume-2"
            text={t('channel.limitAudio', { dur: formatDuration(channel.maxAudioDurationMs, t) })}
          />
          <Chip icon="save" text={t('channel.limitSize', { mb: mb(channel.maxFileSizeBytes) })} />
          <Chip icon="send" text={t('channel.limitText', { n: TEXT_MAX_LEN })} />
        </div>
      </div>
    </div>
  );
}
