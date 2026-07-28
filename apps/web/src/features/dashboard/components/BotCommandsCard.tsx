import type { BotCommandInfo } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card } from '@/ui';

/**
 * What the chat bot answers to. The list comes from the server's command registry, never from a
 * copy kept here — a command added, renamed or switched off in the bot cannot disagree with this
 * screen. Only the descriptions are local (they are product copy); a command with no copy yet still
 * lists, just without a line under it.
 *
 * Disabled commands are shown, greyed: a streamer has to see `!play` exists before they can want
 * the toggle that turns it on.
 */
export function BotCommandsCard({ commands }: { commands: BotCommandInfo[] }) {
  const { t } = useI18n();
  if (commands.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <span className="flex items-center gap-1.5 text-sm text-text">
        <Icon name="message-circle" size={15} />
        {t('botCmd.title')}
      </span>
      <span className="text-xs text-muted">{t('botCmd.note')}</span>

      <ul className="flex flex-col gap-2.5 border-t border-line pt-3">
        {commands.map((cmd) => {
          // t() echoes the key back when there is no entry — that is "no description yet".
          const key = `botCmd.${cmd.name}`;
          const description = t(key);
          return (
            <li key={cmd.name} className={cmd.enabled ? '' : 'opacity-50'}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <code className="label-mono text-accent">!{cmd.name}</code>
                {cmd.aliases.map((alias) => (
                  <code key={alias} className="label-mono text-faint">
                    !{alias}
                  </code>
                ))}
                {!cmd.enabled && <span className="label-mono text-faint">· {t('botCmd.off')}</span>}
              </div>
              {description !== key && <p className="mt-0.5 text-xs text-muted">{description}</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
