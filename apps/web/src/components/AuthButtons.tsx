import { WELCOME_DUST } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Button, Icon } from '@/ui';

export function AuthButtons({
  returnTo,
  dustHint = false,
}: {
  returnTo: string;
  /** Viewer entries only: name what logging in actually buys them — the welcome bonus (either
   *  provider) and, under the Twitch button, the chat dust held against their twitch id. Off
   *  elsewhere: a streamer signing in to their own dashboard is not here for cosmetics. */
  dustHint?: boolean;
}) {
  const { t } = useI18n();
  const rt = encodeURIComponent(returnTo);
  return (
    <div className="flex flex-col items-center gap-2">
      {/* Above both buttons on purpose — the bonus does not depend on which one they pick. */}
      {dustHint && (
        <span className="mb-1 flex items-center gap-1.5 text-sm text-accent">
          <Icon name="sparkles" size={15} />
          {t('auth.welcomeDust', { n: WELCOME_DUST })}
        </span>
      )}
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
