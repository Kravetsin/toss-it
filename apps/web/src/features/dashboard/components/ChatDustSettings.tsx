import type { ChannelSettings } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card } from '@/ui';

/**
 * Chat-dust status card. Purely informational: the opt-in is /mod'ding the bot
 * on Twitch, so there is nothing to toggle here. Hidden when the bot is off
 * or the owner didn't log in via Twitch.
 */
export function ChatDustSettings({ settings }: { settings: ChannelSettings }) {
  const { t } = useI18n();
  if (!settings.chatBotLogin) return null;

  return (
    <Card className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-sm text-text">
        <Icon name="sparkles" size={15} />
        {t('chatDust.title')}
      </span>
      <span className="text-xs text-muted">{t('chatDust.note')}</span>
      {settings.chatBotReading ? (
        <span className="flex items-center gap-1.5 text-xs text-ok">
          <Icon name="check" size={14} />
          {t('chatDust.reading')}
        </span>
      ) : (
        <span className="text-xs text-muted">
          {t('chatDust.modHint', { bot: settings.chatBotLogin })}
        </span>
      )}
    </Card>
  );
}
