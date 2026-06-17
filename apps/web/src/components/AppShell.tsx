import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { SessionUser } from '@tmw/shared';
import { logout } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useI18n } from '@/i18n';
import { Avatar, Badge, Button, IconButton } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';

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
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 label-mono transition-colors duration-[var(--dur-fast)] ease-out ${
          isActive
            ? 'bg-accent-soft text-accent'
            : 'text-muted hover:bg-surface-2 hover:text-text'
        }`
      }
    >
      <Icon name={icon} size={18} />
      {label}
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
  return (
    <NavLink
      to={to}
      end={to === '/'}
      aria-label={label}
      title={label}
      className={({ isActive }) =>
        `inline-flex size-9 items-center justify-center rounded-full border transition-colors duration-[var(--dur-fast)] ease-out ${
          isActive
            ? 'border-transparent bg-accent-soft text-accent'
            : 'border-border text-muted hover:text-text'
        }`
      }
    >
      <Icon name={icon} size={18} />
    </NavLink>
  );
}

/** Десктопный сайдбар: бренд → навигация → аккаунт-блок снизу. */
function Sidebar({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex">
      <div className="px-5 py-5">
        <Brand />
      </div>

      <nav className="flex flex-col gap-1 px-3">
        <NavItem to="/" icon="home" label={t('nav.home')} />
        <NavItem to="/dashboard" icon="shield" label={t('nav.dashboard')} />
      </nav>

      <div className="flex-1" />

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-1 py-2">
          <Avatar url={user.avatarUrl} name={user.displayName} size={36} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{user.displayName}</p>
            <p className="label-mono truncate text-faint">{user.login}</p>
          </div>
        </div>
        {user.isFounder && (
          <div className="px-1 pb-2">
            <Badge>
              <Icon name="sparkles" size={12} />
              {t('badge.founder')}
            </Badge>
          </div>
        )}
        <div className="flex flex-col items-start gap-1">
          <Link
            to="/promo"
            className="label-mono px-1 py-1 text-muted transition-colors duration-[var(--dur-fast)] ease-out hover:text-text"
          >
            {t('promo.haveCode')}
          </Link>
          {user.isAdmin && (
            <Link
              to="/admin"
              className="label-mono px-1 py-1 text-muted transition-colors duration-[var(--dur-fast)] ease-out hover:text-text"
            >
              {t('admin.title')}
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={onLogout}>
            {t('home.logout')}
          </Button>
        </div>
      </div>
    </aside>
  );
}

/** Мобильная верхняя панель (< lg): бренд + icon-навигация + выход. */
function MobileBar({ onLogout }: { onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border bg-bg/85 px-4 py-2.5 backdrop-blur lg:hidden">
      <Brand />
      <nav className="flex items-center gap-1.5">
        <MobileNavIcon to="/" icon="home" label={t('nav.home')} />
        <MobileNavIcon to="/dashboard" icon="shield" label={t('nav.dashboard')} />
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
    <div className="min-h-screen bg-bg text-text">
      {user && <MobileBar onLogout={onLogout} />}
      <div className="lg:flex">
        {user && <Sidebar user={user} onLogout={onLogout} />}
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
