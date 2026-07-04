import { useCallback, useEffect, useState } from 'react';
import type { AdminUserRow } from '@tmw/shared';
import { listAdminUsers, setUserStardust } from '@/lib/api';
import { useApiAction } from '@/hooks/useApiAction';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Badge, Card, Input } from '@/ui';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';
import { DustMark } from '@/components/DustMark';

/** Inline stardust editor: click the value, Enter/blur saves, Escape cancels. */
function DustCell({ user, onSaved }: { user: AdminUserRow; onSaved: (v: number) => void }) {
  const { t } = useI18n();
  const act = useApiAction();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(user.stardust));

  const save = () => {
    setEditing(false);
    const next = Math.round(Number(value));
    if (!Number.isFinite(next) || next < 0 || next === user.stardust) return;
    void act(
      async () => {
        const res = await setUserStardust(user.id, next);
        onSaved(res.stardust);
      },
      { success: t('admin.dustSaved') },
    );
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(String(user.stardust));
          setEditing(true);
        }}
        title={t('admin.dustEditHint')}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent px-1.5 py-0.5 tabular-nums text-text transition-colors hover:border-border hover:text-accent"
      >
        <DustMark size={13} className="text-accent" />
        {user.stardust}
      </button>
    );
  }
  return (
    <Input
      autoFocus
      type="number"
      min={0}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="w-24 py-0.5 text-sm"
    />
  );
}

/** Support table: recent/matching users, balances editable inline. */
export function AdminUsersPanel() {
  const { t, lang } = useI18n();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(id);
  }, [term]);

  const refresh = useCallback(() => {
    void listAdminUsers(debounced)
      .then((r) => {
        setRows(r);
        setLoaded(true);
      })
      .catch(() => {});
  }, [debounced]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const patchRow = (id: string, stardust: number) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, stardust } : r)));

  return (
    <div className="mt-8 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display">{t('admin.usersTitle')}</h2>
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('admin.usersSearch')}
          className="ml-auto w-56 text-sm"
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{loaded ? t('admin.usersEmpty') : t('common.loading')}</p>
      ) : (
        <Card>
          <ul className="flex flex-col gap-2 text-sm">
            {rows.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {u.avatarUrl ? (
                  <img src={u.avatarUrl} alt="" className="h-6 w-6 rounded-full" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-xs">
                    {u.displayName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <b>{u.displayName}</b>
                <span className="text-muted">@{u.login}</span>
                {u.identities.map((p) => (
                  <PlatformIcon key={p} userId={`${p}:x`} size={13} />
                ))}
                <UserBadges isFounder={u.isFounder} variant="icons" />
                {u.hasChannel && (
                  <span title={t('admin.hasChannel')}>
                    <Icon name="monitor" size={13} className="text-muted" />
                  </span>
                )}
                {u.ownedCosmetics > 0 && (
                  <span className="text-xs text-muted">
                    {t('admin.cosmeticsCount', { n: u.ownedCosmetics })}
                  </span>
                )}
                {u.pendingDust > 0 && (
                  <Badge>{t('admin.pendingDust', { n: u.pendingDust })}</Badge>
                )}
                <span className="text-xs text-faint">
                  {new Date(u.createdAt).toLocaleDateString(lang)}
                </span>
                <span className="ml-auto">
                  <DustCell user={u} onSaved={(v) => patchRow(u.id, v)} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
