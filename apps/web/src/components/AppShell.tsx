import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useFillEffect } from '@/ui/useFillEffect';
import type { SessionUser } from '@tmw/shared';
import { logout } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { LanguageToggle, LanguageToggleCycle, useI18n } from '@/i18n';
import { Avatar, IconButton, Tooltip } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';
import { BackgroundStars } from '@/components/BackgroundStars';
import { DustMark } from '@/components/DustMark';
import { ProfileCard } from '@/components/ProfileCard';
import { useShop } from '@/providers/ShopProvider';
import { NotificationBell } from '@/components/NotificationBell';

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="Tossit">
      <span className="flex size-7 items-center justify-center bg-accent font-mono text-base font-bold text-accent-contrast">
        T
      </span>
      {!compact && <span className="label-mono text-text">tossit</span>}
    </Link>
  );
}

function NavItem({
  to,
  icon,
  label,
  collapsed = false,
  end,
  onClick,
}: {
  to: string;
  icon: IconName;
  label: string;
  collapsed?: boolean;
  end?: boolean;
  onClick?: () => void;
}) {
  const { fillRef, handlers } = useFillEffect();
  const link = (
    <NavLink
      to={to}
      end={end ?? to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        `relative flex w-full items-center overflow-hidden px-3 py-2.5 label-mono ${
          collapsed ? 'justify-center' : 'justify-start'
        } ${isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text'}`
      }
      style={{
        gap: collapsed ? 0 : '0.75rem',
        transition:
          'gap var(--dur) ease-out, color var(--dur-fast) ease-out, background-color var(--dur-fast) ease-out',
      }}
      {...handlers}
    >
      <span
        ref={fillRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)', clipPath: 'circle(0% at 50% 50%)' }}
      />
      <Icon name={icon} size={18} className="relative z-[1] shrink-0" />
      <span
        className="relative z-[1] overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-[var(--dur)] ease-out"
        style={{ maxWidth: collapsed ? 0 : '10rem', opacity: collapsed ? 0 : 1 }}
      >
        {label}
      </span>
    </NavLink>
  );

  return collapsed ? (
    <Tooltip content={label} placement="right" focusable={false} className="w-full">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function MobileNavIcon({
  to,
  icon,
  label,
  end,
  tip,
}: {
  to: string;
  icon: IconName;
  label: string;
  end?: boolean;
  tip?: 'top' | 'bottom' | 'left' | 'right';
}) {
  const { fillRef, handlers } = useFillEffect();
  const link = (
    <NavLink
      to={to}
      end={end ?? to === '/'}
      aria-label={label}
      className={({ isActive }) =>
        `relative inline-flex size-9 items-center justify-center overflow-hidden rounded-full border transition-colors duration-[var(--dur-fast)] ease-out ${
          isActive
            ? 'border-transparent bg-accent-soft text-accent'
            : 'border-border text-muted hover:text-text'
        }`
      }
      {...handlers}
    >
      <span
        ref={fillRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 rounded-full"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)', clipPath: 'circle(0% at 50% 50%)' }}
      />
      <Icon name={icon} size={18} className="relative z-[1]" />
    </NavLink>
  );
  return tip ? (
    <Tooltip content={label} placement={tip} focusable={false}>
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function AccountRow({
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
  const cls = `flex items-center gap-2.5 px-2.5 py-2 text-sm text-muted outline-none transition-colors duration-[var(--dur-fast)] ease-out focus-visible:[box-shadow:var(--shadow-focus)] ${
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

function AccountBlock({
  user,
  onLogout,
  onFeedback,
  onNavigate,
}: {
  user: SessionUser;
  onLogout: () => void;
  onFeedback: () => void;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const { openShop } = useShop();
  return (
    <div className="border-t border-border p-3">
      <ProfileCard user={user} />

      {/* Stardust + shop: the one fixed home for the wallet across the streamer console. */}
      <button
        type="button"
        onClick={openShop}
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
        <AccountRow to="/promo" icon="gift" label={t('promo.haveCode')} onClick={onNavigate} />
        {user.isAdmin && (
          <AccountRow to="/admin" icon="settings" label={t('admin.title')} onClick={onNavigate} />
        )}
        <AccountRow onClick={onLogout} icon="log-out" label={t('home.logout')} danger />
      </div>
      <LanguageToggle className="mt-2 rounded-full border border-border p-1" />
      <button
        type="button"
        onClick={onFeedback}
        className="mt-2 w-full text-left text-xs text-muted transition-colors duration-[var(--dur-fast)] hover:text-text"
      >
        {t('feedback.button')}
      </button>
    </div>
  );
}

function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <div
      inert={!open}
      className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${open ? '' : 'pointer-events-none'}`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-[var(--dur)] ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        className={`glass glass-strong relative w-full max-w-sm border border-glass-border p-5 shadow-4 transition-all duration-[var(--dur)] ${open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="label-mono text-text">{t('feedback.title')}</h2>
          <IconButton name="close" label="Close" variant="ghost" size="sm" onClick={onClose} />
        </div>
        <p className="mb-4 text-sm text-muted">{t('feedback.body')}</p>
        <div className="flex flex-col gap-2">
          <a
            href="https://discord.gg/WEM8vJb"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 border border-border p-3 text-sm text-text transition-colors duration-[var(--dur-fast)] hover:bg-surface-2"
          >
            <Icon name="discord" size={20} className="shrink-0 text-[#5865F2]" />
            <span>{t('feedback.discord')}</span>
          </a>
          <a
            href="https://t.me/Kravetsin"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 border border-border p-3 text-sm text-text transition-colors duration-[var(--dur-fast)] hover:bg-surface-2"
          >
            <Icon name="telegram" size={20} className="shrink-0 text-[#2AABEE]" />
            <span>{t('feedback.telegram')}</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  user,
  onLogout,
  onFeedback,
  collapsed,
  onToggle,
}: {
  user: SessionUser;
  onLogout: () => void;
  onFeedback: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const { openShop } = useShop();
  return (
    <aside
      className="relative sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface md:flex overflow-visible"
      style={{ width: collapsed ? '4rem' : '15rem', transition: 'width var(--dur) ease-out' }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-1/2 z-10 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-muted shadow-1 transition-colors duration-[var(--dur-fast)] hover:border-border-strong hover:text-text"
      >
        <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={12} />
      </button>

      <div
        className={`flex items-center overflow-hidden px-3 py-5 ${collapsed ? 'justify-center' : ''}`}
      >
        <Link
          to="/"
          aria-label="Tossit"
          className="flex shrink-0 items-center"
          style={{ gap: collapsed ? 0 : '0.5rem', transition: 'gap var(--dur) ease-out' }}
        >
          <span className="flex size-7 shrink-0 items-center justify-center bg-accent font-mono text-base font-bold text-accent-contrast">
            T
          </span>
          <span
            className="overflow-hidden whitespace-nowrap label-mono text-text transition-[max-width,opacity] duration-[var(--dur)] ease-out"
            style={{ maxWidth: collapsed ? 0 : '8rem', opacity: collapsed ? 0 : 1 }}
          >
            tossit
          </span>
        </Link>
      </div>

      <nav className="flex flex-col gap-1 px-2">
        <NavItem to="/" icon="home" label={t('nav.home')} collapsed={collapsed} />
        <NavItem
          to="/dashboard"
          icon="shield"
          label={t('nav.dashboard')}
          collapsed={collapsed}
          end
        />
        <NavItem to="/dashboard/stats" icon="chart" label={t('nav.stats')} collapsed={collapsed} />
        <NavItem
          to="/dashboard/achievements"
          icon="trophy"
          label={t('nav.achievements')}
          collapsed={collapsed}
        />
        <NavItem
          to="/dashboard/settings"
          icon="settings"
          label={t('nav.settings')}
          collapsed={collapsed}
        />
        <NotificationBell variant="sidebar" collapsed={collapsed} />
      </nav>

      <div className="flex-1" />

      {collapsed ? (
        <div className="flex flex-col items-center gap-1.5 border-t border-border p-2">
          <Avatar url={user.avatarUrl} name={user.displayName} size={34} />
          <Tooltip
            content={`${user.stardust} · ${t('wallet.shopLabel')}`}
            placement="right"
            focusable={false}
          >
            <button
              type="button"
              onClick={openShop}
              aria-label={t('shop.open')}
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted outline-none transition-colors hover:border-accent hover:text-text focus-visible:[box-shadow:var(--shadow-focus)]"
            >
              <DustMark size={16} className="text-accent" />
            </button>
          </Tooltip>
          <MobileNavIcon to="/promo" icon="gift" label={t('promo.haveCode')} tip="right" />
          {user.isAdmin && (
            <MobileNavIcon to="/admin" icon="settings" label={t('admin.title')} tip="right" />
          )}
          <LanguageToggleCycle tip="right" />
          <IconButton
            name="log-out"
            label={t('home.logout')}
            variant="ghost"
            size="sm"
            tooltipPlacement="right"
            onClick={onLogout}
          />
          <IconButton
            name="message-circle"
            label={t('feedback.button')}
            variant="ghost"
            size="sm"
            tooltipPlacement="right"
            onClick={onFeedback}
          />
        </div>
      ) : (
        <AccountBlock user={user} onLogout={onLogout} onFeedback={onFeedback} />
      )}
    </aside>
  );
}

function MobileSidebar({
  open,
  onClose,
  user,
  onLogout,
  onFeedback,
}: {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
  onLogout: () => void;
  onFeedback: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <div
      inert={!open}
      className={`fixed inset-0 z-[60] md:hidden ${open ? '' : 'pointer-events-none'}`}
    >
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 transition-opacity duration-[var(--dur)] ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        role={open ? 'dialog' : undefined}
        aria-modal={open ? true : undefined}
        className={`absolute inset-y-0 left-0 flex w-72 flex-col border-r border-border bg-surface shadow-4 transition-transform duration-[var(--dur)] ease-out ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Link to="/" onClick={onClose} className="flex items-center gap-2" aria-label="Tossit">
            <span className="flex size-7 shrink-0 items-center justify-center bg-accent font-mono text-base font-bold text-accent-contrast">
              T
            </span>
            <span className="label-mono text-text">tossit</span>
          </Link>
          <IconButton name="close" label="Close menu" variant="ghost" size="sm" onClick={onClose} />
        </div>

        <nav className="flex flex-col gap-1 px-3">
          <NavItem to="/" icon="home" label={t('nav.home')} onClick={onClose} />
          <NavItem to="/dashboard" icon="shield" label={t('nav.dashboard')} onClick={onClose} end />
          <NavItem to="/dashboard/stats" icon="chart" label={t('nav.stats')} onClick={onClose} />
          <NavItem
            to="/dashboard/achievements"
            icon="trophy"
            label={t('nav.achievements')}
            onClick={onClose}
          />
          <NavItem
            to="/dashboard/settings"
            icon="settings"
            label={t('nav.settings')}
            onClick={onClose}
          />
        </nav>

        <div className="flex-1" />

        <AccountBlock
          user={user}
          onLogout={() => {
            onLogout();
            onClose();
          }}
          onFeedback={() => {
            onFeedback();
            onClose();
          }}
          onNavigate={onClose}
        />
      </div>
    </div>
  );
}

function MobileBar({ onMenu }: { onMenu: () => void }) {
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-bg/85 px-4 py-2.5 backdrop-blur md:hidden">
      <Brand />
      <nav className="flex items-center gap-1.5">
        <MobileNavIcon to="/" icon="home" label={t('nav.home')} />
        <MobileNavIcon to="/dashboard" icon="shield" label={t('nav.dashboard')} end />
        <MobileNavIcon to="/dashboard/stats" icon="chart" label={t('nav.stats')} />
        <MobileNavIcon to="/dashboard/achievements" icon="trophy" label={t('nav.achievements')} />
        <MobileNavIcon to="/dashboard/settings" icon="settings" label={t('nav.settings')} />
        <NotificationBell variant="icon" />
        <IconButton name="menu" label={t('nav.menu')} variant="ghost" size="sm" onClick={onMenu} />
      </nav>
    </div>
  );
}

/** Sidebar/mobile bar only shown to logged-in user; landing/auth render full-width (REDESIGN.md §7.1). */
const SIDEBAR_KEY = 'tmw_sidebar_collapsed';

export function AppShell() {
  const { me, refresh } = useMe();
  const act = useApiAction();
  const navigate = useNavigate();
  const user = me?.user;
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1');

  const onLogout = () =>
    void act(logout, {
      after: async () => {
        await refresh();
        navigate('/');
      },
    });

  const onToggleSidebar = () =>
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      return next;
    });

  return (
    <div className="relative min-h-screen bg-bg text-text">
      <BackgroundStars />
      <div className="relative z-10">
        {user && <MobileBar onMenu={() => setMobileMenuOpen(true)} />}
        <div className="md:flex">
          {user && (
            <Sidebar
              user={user}
              onLogout={onLogout}
              onFeedback={() => setFeedbackOpen(true)}
              collapsed={collapsed}
              onToggle={onToggleSidebar}
            />
          )}
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>
      {user && (
        <MobileSidebar
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          user={user}
          onLogout={onLogout}
          onFeedback={() => setFeedbackOpen(true)}
        />
      )}
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </div>
  );
}
