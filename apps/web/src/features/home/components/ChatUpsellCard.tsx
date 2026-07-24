import { useClipboard } from '@/hooks/useClipboard';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card, CopyableLinkBox } from '@/ui';

/**
 * Permanent home for the chat feature when the owner hasn't linked Twitch. The guide collapses on
 * the required steps (overlay + first send), so the chat upsell can't live there — it would vanish
 * for exactly the people we want to sell it to. Both actions are independent and either order works:
 * mod the bot now (a pure Twitch action) and link Twitch (so we know which channel to join), which
 * lets the ~5-min bot-join wait overlap with linking. Shown only when the bot service is up.
 */
export function ChatUpsellCard({ botLogin }: { botLogin: string }) {
  const { t } = useI18n();
  const { copiedKey, copy } = useClipboard();
  const modCommand = `/mod ${botLogin}`;

  return (
    <Card className="flex flex-col gap-3 border-accent/30">
      <h2 className="flex items-center gap-2">
        <Icon name="message-circle" size={18} className="text-accent" />
        {t('guide.chat.title')}
      </h2>
      <p className="text-sm text-muted">{t('guide.chat.why')}</p>
      <p className="text-sm text-muted">{t('guide.chat.noTwitch')}</p>

      <div className="flex flex-col gap-2">
        <p className="flex items-start gap-2 text-xs text-faint">
          <Icon name="message-circle" size={14} className="mt-0.5 shrink-0" />
          <span>{t('guide.chat.preMod')}</span>
        </p>
        <CopyableLinkBox
          value={modCommand}
          size="sm"
          copied={copiedKey === 'mod'}
          onCopy={() => copy(modCommand, 'mod')}
        />
      </div>

      <a
        href={`/api/auth/link/twitch?returnTo=${encodeURIComponent(
          window.location.pathname + window.location.search,
        )}`}
        className="self-start"
      >
        <Button variant="primary" size="sm">
          <Icon name="twitch" size={15} />
          {t('link.bannerCta')}
        </Button>
      </a>
    </Card>
  );
}
