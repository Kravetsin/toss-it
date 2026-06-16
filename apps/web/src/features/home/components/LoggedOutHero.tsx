import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button } from '@/ui';
import { ScrollFlow } from '@/marketing/ScrollFlow/ScrollFlow';

/** Экран для неавторизованного пользователя: лого, слоган, кнопки входа и анимация. */
export function LoggedOutHero() {
  const { t } = useI18n();
  return (
    <>
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <img
          src="/favicon.svg"
          alt="Tossit"
          width={72}
          height={72}
          className="[image-rendering:pixelated]"
        />
        <h1>
          Toss<span className="text-twitch-light">it</span>
        </h1>
        <p className="max-w-md text-muted">{t('home.tagline')}</p>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <a href="/api/auth/login?returnTo=/">
              <Button variant="primary" className="px-6 py-3">
                <Icon name="twitch" size={18} />
                {t('common.loginTwitch')}
              </Button>
            </a>
            <a
              href="/api/auth/login?returnTo=/&switch=1"
              title={t('home.loginOther')}
              aria-label={t('home.loginOther')}
            >
              <Button variant="secondary" className="px-3 py-3">
                <Icon name="swap" size={18} />
              </Button>
            </a>
          </div>
          <a href="/api/auth/google/login?returnTo=/">
            <Button variant="primary" className="px-6 py-3">
              <Icon name="google" size={18} />
              {t('common.loginGoogle')}
            </Button>
          </a>
        </div>
      </div>
      <ScrollFlow />
    </>
  );
}
