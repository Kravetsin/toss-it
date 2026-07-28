import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BOT_LOCALES, type BotLocale, type ChannelSettings } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card, Select, Switch } from '@/ui';
import { SaveRow } from './settings/controls';

/**
 * The chat bot: its connection state, and how it answers commands. Collecting dust needs no
 * settings at all (the opt-in is /mod'ding it on Twitch), but answering does — and those belong
 * to the bot, not to the chat overlay's appearance, which is a different tab entirely.
 * Hidden when no bot is configured or the owner didn't log in via Twitch: nothing to set up.
 * Without `onSave` it degrades to the status half — that is how the home page shows it, where
 * the card is a health indicator and not a place to configure anything.
 */
export function ChatDustSettings({
  settings,
  onSave,
}: {
  settings: ChannelSettings;
  onSave?: (patch: Partial<ChannelSettings>) => void;
}) {
  const { t } = useI18n();
  const [botReplies, setBotReplies] = useState(settings.chatBotReplies);
  const [playCommand, setPlayCommand] = useState(settings.chatPlayCommand);
  const [botLocale, setBotLocale] = useState<BotLocale>(settings.botLocale);
  if (!settings.chatBotLogin) return null;

  return (
    <Card className="flex flex-col gap-3">
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

      {onSave && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <span className="label-mono text-faint">{t('dash.chatCommands')}</span>
          {/* Off by default, and asked for separately from /mod: modding the bot was consent to
              read the chat, and writing to it is a different thing to say yes to. */}
          <Switch
            icon="message-circle"
            label={t('dash.chatBotReplies')}
            description={t('dash.chatBotRepliesNote')}
            checked={botReplies}
            onChange={setBotReplies}
          />
          {/* No channel points needed: viewers order YouTube with !play, same limits as a web send. */}
          <Switch
            icon="play"
            label={t('dash.chatPlayCommand')}
            description={t('dash.chatPlayCommandNote')}
            checked={playCommand}
            onChange={setPlayCommand}
          />
          <div className="flex flex-col gap-1.5">
            {/* Select renders `label` as aria only, so the visible caption is ours to draw. */}
            <span className="label-mono text-faint">{t('dash.botLocale')}</span>
            <Select
              label={t('dash.botLocale')}
              value={botLocale}
              onChange={(v) => setBotLocale(v as BotLocale)}
              options={BOT_LOCALES.map((l) => ({ value: l, label: t(`dash.botLocale.${l}`) }))}
            />
            <span className="text-xs text-faint">{t('dash.botLocaleNote')}</span>
          </div>
          <SaveRow
            onClick={() =>
              onSave({ chatBotReplies: botReplies, chatPlayCommand: playCommand, botLocale })
            }
          />
          {/* The other half of "chat": what the bot SAYS is here, how chat LOOKS is a property of
              the overlay source. Both screens point at each other, because a streamer looking for
              "chat settings" has no way of guessing which half they mean. */}
          <p className="flex items-start gap-1.5 text-xs text-faint">
            <Icon name="message-circle" size={13} className="mt-px shrink-0" />
            <span>
              {t('chatDust.overlayNote')}{' '}
              <Link
                to="/dashboard/settings/overlay"
                className="text-accent underline-offset-2 outline-none hover:underline focus-visible:underline"
              >
                {t('settings.overlay')}
              </Link>
            </span>
          </p>
        </div>
      )}
    </Card>
  );
}
