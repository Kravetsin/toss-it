import type { ListedUser } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { Card } from '@/ui';

/** Список пользователей (белый список / баны) с удалением и опциональным баном. */
export function UserList({
  icon,
  title,
  hint,
  users,
  onRemove,
  onBan,
}: {
  icon: IconName;
  title: string;
  hint: string;
  users: ListedUser[];
  onRemove: (userId: string) => void;
  onBan?: (userId: string, displayName: string) => void;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <h2 className="flex items-center gap-2">
        <Icon name={icon} size={18} className="text-twitch-light" />
        {title}
      </h2>
      <p className="mt-0.5 text-sm text-muted">{hint}</p>
      {users.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t('common.empty')}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {users.map((u) => (
            <li key={u.userId} className="flex items-center gap-2">
              <b>{u.displayName}</b>
              <span className="text-xs text-muted">
                {t('dash.since', { date: new Date(u.addedAt).toLocaleDateString() })}
              </span>
              <span className="ml-auto flex gap-2">
                {onBan && (
                  <button
                    onClick={() => onBan(u.userId, u.displayName)}
                    className="cursor-pointer text-muted hover:text-danger"
                    title={t('dash.ban')}
                  >
                    <Icon name="user-x" size={16} />
                  </button>
                )}
                <button
                  onClick={() => onRemove(u.userId)}
                  className="cursor-pointer text-xs text-muted hover:text-danger"
                >
                  {t('dash.removeUser')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
