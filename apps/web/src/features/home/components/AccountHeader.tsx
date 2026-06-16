import { Link } from 'react-router-dom';
import type { SessionUser } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Avatar, Button } from '@/ui';

/** Шапка авторизованного пользователя: аватар, имя, навигация и выход. */
export function AccountHeader({ user, onLogout }: { user: SessionUser; onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Avatar url={user.avatarUrl} name={user.displayName} size={44} />
        <div>
          <p className="font-semibold">{user.displayName}</p>
          <p className="text-xs text-muted">{user.login}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Link to="/promo" className="text-sm text-muted hover:text-text">
          {t('promo.haveCode')}
        </Link>
        {user.isAdmin && (
          <Link to="/admin" className="text-sm text-muted hover:text-text">
            {t('admin.title')}
          </Link>
        )}
        <Button variant="ghost" onClick={onLogout}>
          {t('home.logout')}
        </Button>
      </div>
    </div>
  );
}
