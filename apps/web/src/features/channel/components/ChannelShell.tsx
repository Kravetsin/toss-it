import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { useShop } from '@/providers/ShopProvider';
import { Button, PageShell } from '@/ui';
import { Icon } from '@/ui/icons';
import { BackgroundStars } from '@/components/BackgroundStars';
import { NebulaBackground } from '@/components/NebulaBackground';
import { IS_THEME_PREVIEW } from '../lib/themeQuery';
import { ProfileMenu } from '@/components/ProfileMenu';

/** Guest account cluster: same top-right spot as the wallet — browse the shop, or log in. */
function GuestActions() {
  const { t } = useI18n();
  const { openShop } = useShop();
  const returnTo = encodeURIComponent(window.location.pathname);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={openShop}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm text-muted outline-none transition-colors hover:border-accent hover:text-text focus-visible:[box-shadow:var(--shadow-focus)]"
      >
        <Icon name="sparkles" size={15} className="text-accent" />
        {t('wallet.shopLabel')}
      </button>
      <a href={`/api/auth/login?returnTo=${returnTo}`}>
        <Button variant="primary" size="sm">
          {t('nav.login')}
        </Button>
      </a>
    </div>
  );
}

/** Viewer page layout with home link, footer, and background stars. */
export function ChannelShell({
  children,
  viewerLevel = 0,
  nebula = false,
}: {
  children: ReactNode;
  /** The logged-in viewer's per-channel level, for their always-visible header card. */
  viewerLevel?: number;
  /** Earned galaxy background — shown once the channel hits the played-submission milestone. */
  nebula?: boolean;
}) {
  const { me } = useMe();
  return (
    <PageShell maxWidth="xl">
      {/* Galaxy behind everything; stars twinkle over it. Only for channels that earned it. */}
      {nebula && <NebulaBackground />}
      <BackgroundStars staticMode={IS_THEME_PREVIEW} />
      <div className="relative z-10">
        <div className="mb-6 flex items-center justify-between gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-muted transition-colors hover:text-text"
          >
            <img src="/favicon.svg" alt="Tossit" width={24} height={24} />
            <span className="label-mono">Tossit</span>
          </Link>
          {me?.user ? <ProfileMenu viewerLevel={viewerLevel} /> : <GuestActions />}
        </div>
        {children}
        <p className="mt-10 text-center label-mono text-faint">Tossit</p>
      </div>
    </PageShell>
  );
}
