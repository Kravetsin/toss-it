import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useFillEffect } from '@/ui/useFillEffect';
import type { SessionUser } from '@tmw/shared';
import { logout } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { LanguageToggle, useI18n } from '@/i18n';
import { Avatar, IconButton } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';
import { BackgroundStars } from '@/components/BackgroundStars';

/** Бренд-знак: угловатый акцентный «T» + вордмарк. */
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

/** Пункт боковой навигации (десктоп). */
function NavItem({ to, icon, label }: { to: string; icon: IconName; label: string }) {
  const { fillRef, handlers } = useFillEffect();
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={label}
      className={({ isActive }) =>
        `relative flex items-center justify-center gap-3 overflow-hidden px-3 py-2.5 label-mono transition-colors duration-[var(--dur-fast)] ease-out lg:justify-start ${
          isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text'
        }`
      }
      {...handlers}
    >
      <span
        ref={fillRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{ backgroundColor: 'rgba(255,255,255,0.08)', clipPath: 'circle(0% at 50% 50%)' }}
      />
      <Icon name={icon} size={18} className="relative z-[1]" />
      <span className="relative z-[1] hidden lg:inline">{label}</span>
    </NavLink>
  );
}

/** Круглый icon-NavLink для мобильной панели. */
function MobileNavIcon({
  to,
  icon,
  label,
}: {
  to: string;
  icon: IconName;
  label: string;
}) {
  const { fillRef, handlers } = useFillEffect();
  return (
    <NavLink
      to={to}
      end={to === '/'}
      aria-label={label}
      title={label}
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
}

/** Строка аккаунт-меню: иконка + лейбл, единый hover. Ссылка или действие. */
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
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={`${cls} w-full cursor-pointer text-left`}>
      {inner}
    </button>
  );
}

/** Десктопный сайдбар: бренд → навигация → аккаунт-блок снизу. */
function Sidebar({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface md:flex md:w-16 lg:w-60">
      <div className="flex justify-center px-3 py-5 lg:justify-start lg:px-5">
        <Link to="/" aria-label="Tossit" className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center bg-accent font-mono text-base font-bold text-accent-contrast">
            T
          </span>
          <span className="hidden label-mono text-text lg:inline">tossit</span>
        </Link>
      </div>

      <nav className="flex flex-col gap-1 px-2 lg:px-3">
        <NavItem to="/" icon="home" label={t('nav.home')} />
        <NavItem to="/dashboard" icon="shield" label={t('nav.dashboard')} />
      </nav>

      <div className="flex-1" />

      {/* lg: полная карточка аккаунта + меню. */}
      <div className="hidden border-t border-border p-3 lg:block">
        <div className="flex flex-col gap-2.5 border border-border bg-surface-2 p-3 shadow-1">
          <div className="flex items-center gap-3">
            <Avatar url={user.avatarUrl} name={user.displayName} size={40} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-text">
                <span className="truncate">{user.displayName}</span>
                <PlatformIcon userId={user.id} size={14} />
              </p>
              <p className="truncate text-xs text-muted">@{user.login}</p>
            </div>
          </div>
          <UserBadges isFounder={user.isFounder} variant="chips" className="self-start" />
        </div>
        <div className="mt-2 flex flex-col gap-0.5">
          <AccountRow to="/promo" icon="gift" label={t('promo.haveCode')} />
          {user.isAdmin && <AccountRow to="/admin" icon="settings" label={t('admin.title')} />}
          <AccountRow onClick={onLogout} icon="log-out" label={t('home.logout')} danger />
        </div>
        <LanguageToggle className="mt-2 rounded-full border border-border p-1" />
      </div>

      {/* md-rail: только аватар + язык + выход. */}
      <div className="flex flex-col items-center gap-2 border-t border-border p-2 lg:hidden">
        <Avatar url={user.avatarUrl} name={user.displayName} size={34} />
        <LanguageToggle className="flex-col rounded-full border border-border p-0.5" />
        <IconButton
          name="log-out"
          label={t('home.logout')}
          variant="ghost"
          size="sm"
          onClick={onLogout}
        />
      </div>
    </aside>
  );
}

/** Мобильная верхняя панель (< lg): бренд + icon-навигация + выход. */
function MobileBar({ onLogout }: { onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-bg/85 px-4 py-2.5 backdrop-blur md:hidden">
      <Brand />
      <nav className="flex items-center gap-1.5">
        <MobileNavIcon to="/" icon="home" label={t('nav.home')} />
        <MobileNavIcon to="/dashboard" icon="shield" label={t('nav.dashboard')} />
        <LanguageToggle className="rounded-full border border-border p-0.5" />
        <IconButton
          name="log-out"
          label={t('home.logout')}
          variant="ghost"
          size="sm"
          onClick={onLogout}
        />
      </nav>
    </div>
  );
}

/**
 * Постоянная оболочка приложения для стримерских маршрутов (`/`, `/dashboard`).
 * Сайдбар/мобильная панель показываются только залогиненному пользователю —
 * лендинг и экраны входа рендерятся во всю ширину. См. apps/web/REDESIGN.md §7.1.
 */
export function AppShell() {
  const { me, refresh } = useMe();
  const act = useApiAction();
  const navigate = useNavigate();
  const user = me?.user;

  const onLogout = () =>
    void act(logout, {
      after: async () => {
        await refresh();
        navigate('/');
      },
    });

  return (
    <div className="relative min-h-screen bg-bg text-text">
      <BackgroundStars />
      <div className="relative z-10">
        {user && <MobileBar onLogout={onLogout} />}
        <div className="md:flex">
          {user && <Sidebar user={user} onLogout={onLogout} />}
          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
