import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Tooltip } from '@/ui';
import { ScrollFlow } from '@/marketing/ScrollFlow/ScrollFlow';

export function LoggedOutHero() {
  const { t } = useI18n();
  return (
    <>
      <div className="flex flex-col items-center gap-6 py-16 text-center">
        <img src="/favicon.svg" alt="Tossit" width={72} height={72} />
        <h1>
          Toss<span className="text-accent-hover">it</span>
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
            <Tooltip content={t('home.loginOther')} focusable={false}>
              <a href="/api/auth/login?returnTo=/&switch=1" tabIndex={-1}>
                <Button variant="secondary" className="px-3 py-3" aria-label={t('home.loginOther')}>
                  <Icon name="swap" size={18} />
                </Button>
              </a>
            </Tooltip>
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
