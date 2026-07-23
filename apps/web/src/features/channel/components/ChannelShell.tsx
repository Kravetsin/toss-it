import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { useShop } from '@/providers/ShopProvider';
import { Button, PageShell } from '@/ui';
import { Icon } from '@/ui/icons';
import { BackgroundStars } from '@/components/BackgroundStars';
import { NewDotGroup } from '@/components/NewDot';
import { NebulaBackground } from '@/components/NebulaBackground';
import { BlackHoleBackground } from '@/components/BlackHoleBackground';
import { IS_THEME_PREVIEW } from '../lib/themeQuery';
import { ProfileMenu } from '@/components/ProfileMenu';

/** Renders the earned page background by id (server already gated it to a background the channel has). */
export function PageBackground({ id }: { id: string }) {
  if (id === 'nebula') return <NebulaBackground />;
  if (id === 'blackhole') return <BlackHoleBackground />;
  return null;
}

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
        className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm text-muted outline-none transition-colors hover:border-accent hover:text-text focus-visible:[box-shadow:var(--shadow-focus)]"
      >
        <Icon name="sparkles" size={15} className="text-accent" />
        {t('wallet.shopLabel')}
        <NewDotGroup corner />
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
  viewerXp = 0,
  pageBackground = '',
}: {
  children: ReactNode;
  /** The logged-in viewer's per-channel level, for their always-visible header card. */
  viewerLevel?: number;
  /** Their raw per-channel XP, for the level badge's progress hover. */
  viewerXp?: number;
  /** Earned page background id ('' = none); server already checked the channel earned it. */
  pageBackground?: string;
}) {
  const { me } = useMe();
  return (
    <PageShell maxWidth="xl">
      {/* Earned background behind everything; stars twinkle over it. Only for channels that earned it. */}
      <PageBackground id={pageBackground} />
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
          {me?.user ? (
            <ProfileMenu viewerLevel={viewerLevel} viewerXp={viewerXp} />
          ) : (
            <GuestActions />
          )}
        </div>
        {children}
        <p className="mt-10 text-center label-mono text-faint">Tossit</p>
      </div>
    </PageShell>
  );
}
