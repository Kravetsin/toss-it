import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { logout } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { useShop } from '@/providers/ShopProvider';
import { useApiAction } from '@/hooks/useApiAction';
import { registerStardustWallet } from '@/lib/stardustFx';
import { Avatar } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';
import { DustMark } from '@/components/DustMark';
import { ProfileCard } from '@/components/ProfileCard';

function Row({
  icon,
  label,
  to,
  onClick,
  danger = false,
}: {
  icon: IconName;
  label: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const cls = `flex items-center gap-2.5 px-2.5 py-2 text-sm text-muted outline-none transition-colors duration-[var(--dur-fast)] ${
    danger ? 'hover:bg-danger-soft hover:text-danger' : 'hover:bg-surface-2 hover:text-text'
  }`;
  const inner = (
    <>
      <Icon name={icon} size={16} className="shrink-0 opacity-80" />
      <span className="truncate">{label}</span>
    </>
  );
  return to ? (
    <Link to={to} onClick={onClick} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${cls} w-full cursor-pointer text-left`}>
      {inner}
    </button>
  );
}

/**
 * Viewer-page account control (top-right): the sidebar's profile block has no home here, so this
 * popover is its equivalent — it shows the user's cosmetic card, stardust + shop, and account links.
 * Also the stardust fly-animation target, so earned dust flies to the avatar.
 */
export function ProfileMenu() {
  const { me, refresh } = useMe();
  const { t } = useI18n();
  const { openShop } = useShop();
  const act = useApiAction();
  const navigate = useNavigate();
  const user = me?.user;
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (!user) return;
    registerStardustWallet({
      rect: () => btnRef.current?.getBoundingClientRect() ?? null,
      bump: () => {
        setPop(true);
        window.setTimeout(() => setPop(false), 400);
      },
    });
    return () => registerStardustWallet(null);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (btnRef.current?.contains(tgt) || popRef.current?.contains(tgt)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const onLogout = () =>
    void act(logout, {
      after: async () => {
        await refresh();
        navigate('/');
      },
    });

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={t('nav.profile')}
        aria-expanded={open}
        className={`rounded-full outline-none transition-transform duration-200 hover:opacity-90 focus-visible:[box-shadow:var(--shadow-focus)] ${pop ? 'scale-110' : ''}`}
      >
        <Avatar url={user.avatarUrl} name={user.displayName} size={36} />
      </button>
      {open && (
        <div
          ref={popRef}
          role="menu"
          className="glass glass-strong absolute right-0 z-50 mt-2 w-64 border border-glass-border p-3 shadow-3"
        >
          <ProfileCard user={user} />

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              openShop();
            }}
            aria-label={t('shop.open')}
            className="mt-2 flex w-full cursor-pointer items-center justify-between gap-2 border border-border bg-surface-2 px-3 py-2 text-sm outline-none transition-colors hover:border-accent focus-visible:[box-shadow:var(--shadow-focus)]"
          >
            <span className="flex items-center gap-1.5 text-muted">
              <DustMark size={15} className="text-accent" />
              <span className="tabular-nums text-text">{user.stardust}</span>
            </span>
            <span className="label-mono text-accent">{t('wallet.shopLabel')}</span>
          </button>

          <div className="mt-2 flex flex-col gap-0.5">
            {me.channel && (
              <Row
                to="/dashboard"
                icon="shield"
                label={t('nav.dashboard')}
                onClick={() => setOpen(false)}
              />
            )}
            {me.channel && (
              <Row
                to="/dashboard/settings"
                icon="settings"
                label={t('nav.settings')}
                onClick={() => setOpen(false)}
              />
            )}
            <Row
              to="/promo"
              icon="gift"
              label={t('promo.haveCode')}
              onClick={() => setOpen(false)}
            />
            <Row onClick={onLogout} icon="log-out" label={t('home.logout')} danger />
          </div>
        </div>
      )}
    </div>
  );
}
