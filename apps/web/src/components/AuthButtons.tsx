import { useI18n } from '@/i18n';
import { Button, Icon } from '@/ui';

/** Пара кнопок входа (Twitch + Google) с возвратом на returnTo после авторизации. */
export function AuthButtons({ returnTo }: { returnTo: string }) {
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
      <a href={`/api/auth/google/login?returnTo=${rt}`}>
        <Button>
          <Icon name="google" size={15} />
          {t('common.loginGoogle')}
        </Button>
      </a>
    </div>
  );
}
