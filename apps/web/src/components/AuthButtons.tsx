import { useI18n } from '@/i18n';
import { Button, Icon } from '@/ui';

export function AuthButtons({
  returnTo,
  dustHint = false,
}: {
  returnTo: string;
  /** Viewer entries only: name what picking Twitch actually buys them (dust earned in chat is held
   *  against their twitch id and claimed on first login). Off elsewhere — a streamer signing in to
   *  their own dashboard earns no chat/watch dust, so the line would just be noise. */
  dustHint?: boolean;
}) {
  const { t } = useI18n();
  const rt = encodeURIComponent(returnTo);
  return (
    <div className="flex flex-col items-center gap-2">
      <a href={`/api/auth/login?returnTo=${rt}`}>
        <Button variant="primary">
          <Icon name="twitch" size={15} />
          {t('common.loginTwitch')}
        </Button>
      </a>
      {dustHint && (
        <span className="max-w-[17rem] text-center text-xs text-muted">{t('auth.twitchDust')}</span>
      )}
      <a href={`/api/auth/google/login?returnTo=${rt}`}>
        <Button>
          <Icon name="google" size={15} />
          {t('common.loginGoogle')}
        </Button>
      </a>
    </div>
  );
}
