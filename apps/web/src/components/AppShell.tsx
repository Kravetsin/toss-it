import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import type { SessionUser } from '@tmw/shared';
import { logout } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useI18n } from '@/i18n';
import { Avatar, Badge, IconButton } from '@/ui';
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
        {/* Карточка «ты»: аватар, имя, @логин, статус. */}
        <div className="flex flex-col gap-2.5 border border-border bg-surface-2 p-3 shadow-1">
          <div className="flex items-center gap-3">
            <Avatar url={user.avatarUrl} name={user.displayName} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">{user.displayName}</p>
              <p className="truncate text-xs text-muted">@{user.login}</p>
            </div>
          </div>
          {user.isFounder && (
            <Badge>
              <Icon name="sparkles" size={12} />
              {t('badge.founder')}
            </Badge>
          )}
        </div>

        {/* Меню аккаунта: единый ритм, иконки, hover. */}
        <div className="mt-2 flex flex-col gap-0.5">
          <AccountRow to="/promo" icon="gift" label={t('promo.haveCode')} />
          {user.isAdmin && <AccountRow to="/admin" icon="settings" label={t('admin.title')} />}
          <AccountRow onClick={onLogout} icon="log-out" label={t('home.logout')} danger />
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
