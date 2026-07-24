import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button } from '@/ui';
import { BrandSeal } from '@/components/BrandSeal';
import { LandingDemo } from '@/marketing/LandingDemo';

export function LoggedOutHero() {
  const { t } = useI18n();
  return (
    <>
      <div className="flex flex-col items-center gap-5 px-4 py-16 text-center">
        <BrandSeal size={84} />
        <span className="label-mono tracking-[0.2em] text-accent">TOSSIT</span>
        <h1 className="hero-title max-w-2xl text-balance">{t('home.heroTitle')}</h1>
        <p className="max-w-lg text-balance text-muted">{t('home.tagline')}</p>
        <span className="label-mono text-faint">{t('home.platforms')}</span>

        <div className="mt-2 flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-2">
            <a href="/api/auth/login?returnTo=/">
              <Button variant="primary" className="px-6 py-3">
                <Icon name="twitch" size={18} />
                {t('common.loginTwitch')}
              </Button>
            </a>
            <a href="/api/auth/google/login?returnTo=/">
              <Button variant="secondary" className="px-6 py-3">
                <Icon name="google" size={18} />
                {t('common.loginGoogle')}
              </Button>
            </a>
          </div>
          {/* force_verify Twitch login for anyone with multiple accounts — rare, so it's a quiet link. */}
          <a
            href="/api/auth/login?returnTo=/&switch=1"
            className="text-xs text-muted underline decoration-dotted underline-offset-4 outline-none transition-colors hover:text-accent focus-visible:text-accent"
          >
            {t('home.loginOther')}
          </a>
        </div>
      </div>
      <LandingDemo />
    </>
  );
}
