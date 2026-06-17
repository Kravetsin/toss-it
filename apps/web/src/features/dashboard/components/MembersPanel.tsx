import { useState } from 'react';
import type { ListedUser } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { Card } from '@/ui';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';

type Tab = 'whitelist' | 'bans';

function TabBtn({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-2 rounded-none px-3 py-1.5 label-mono transition-colors duration-200 ease-out ${
        active ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
      }`}
    >
      <Icon name={icon} size={15} />
      {label}
      <span className={active ? 'opacity-70' : 'text-faint'}>{count}</span>
    </button>
  );
}

/** Контекст-панель участников канала: табы «Доверенные / Баны» (Фаза 3, замена двух UserList). */
export function MembersPanel({
  allowed,
  banned,
  onRemoveAllowed,
  onRemoveBan,
  onBanAllowed,
}: {
  allowed: ListedUser[];
  banned: ListedUser[];
  onRemoveAllowed: (userId: string) => void;
  onRemoveBan: (userId: string) => void;
  onBanAllowed: (userId: string, displayName: string) => void;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('whitelist');
  const users = tab === 'whitelist' ? allowed : banned;
  const hint = tab === 'whitelist' ? t('dash.whitelistHint') : t('dash.bansHint');

  return (
    <Card>
      <div className="flex gap-1 border border-border bg-surface-2 p-1">
        <TabBtn
          active={tab === 'whitelist'}
          onClick={() => setTab('whitelist')}
          icon="star"
          label={t('dash.whitelist')}
          count={allowed.length}
        />
        <TabBtn
          active={tab === 'bans'}
          onClick={() => setTab('bans')}
          icon="user-x"
          label={t('dash.bans')}
          count={banned.length}
        />
      </div>
      <p className="mt-2 text-xs text-muted">{hint}</p>

      {users.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{t('common.empty')}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {users.map((u) => (
            <li key={u.userId} className="flex items-center gap-2">
              <b className="truncate">{u.displayName}</b>
              <PlatformIcon userId={u.userId} size={13} />
              <UserBadges isFounder={u.isFounder} variant="icons" />
              <span className="shrink-0 text-xs text-muted">
                {t('dash.since', { date: new Date(u.addedAt).toLocaleDateString() })}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {tab === 'whitelist' && (
                  <button
                    onClick={() => onBanAllowed(u.userId, u.displayName)}
                    className="cursor-pointer text-muted outline-none transition-colors duration-[180ms] ease-out hover:text-danger focus-visible:text-danger"
                    title={t('dash.ban')}
                  >
                    <Icon name="user-x" size={16} />
                  </button>
                )}
                <button
                  onClick={() => (tab === 'whitelist' ? onRemoveAllowed : onRemoveBan)(u.userId)}
                  className="cursor-pointer label-mono text-muted outline-none transition-colors duration-[180ms] ease-out hover:text-danger focus-visible:text-danger"
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
