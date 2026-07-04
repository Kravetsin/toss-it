import { useCallback, useEffect, useState } from 'react';
import type { AdminExclusion } from '@tmw/shared';
import { addExclusion, listExclusions, removeExclusion } from '@/lib/api';
import { useApiAction } from '@/hooks/useApiAction';
import { useI18n } from '@/i18n';
import { Button, Card, IconButton, Input } from '@/ui';
import { Icon } from '@/ui/icons';

/** Global leaderboard exclusions: twitch logins (bots) hidden from every board. */
export function AdminExclusionsPanel() {
  const { t } = useI18n();
  const act = useApiAction();
  const [login, setLogin] = useState('');
  const [rows, setRows] = useState<AdminExclusion[]>([]);

  const refresh = useCallback(() => {
    void listExclusions()
      .then(setRows)
      .catch(() => {});
  }, []);
  useEffect(() => refresh(), [refresh]);

  const add = () => {
    const value = login.trim();
    if (!value) return;
    void act(
      async () => {
        await addExclusion(value);
        setLogin('');
        refresh();
      },
      { success: t('excl.added') },
    );
  };

  const remove = (l: string) =>
    void act(
      async () => {
        await removeExclusion(l);
        refresh();
      },
      { success: t('excl.removed') },
    );

  return (
    <Card className="flex flex-col gap-3">
      <p className="text-xs text-muted">{t('excl.hint')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <Input
          value={login}
          placeholder={t('excl.placeholder')}
          onChange={(e) => setLogin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className="w-56"
        />
        <Button variant="primary" onClick={add}>
          <Icon name="user-x" size={16} />
          {t('excl.add')}
        </Button>
      </div>
      {rows.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((r) => (
            <li key={r.login} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Icon name="twitch" size={13} className="text-muted" />
              <b>{r.note || r.login}</b>
              {r.note && r.note.toLowerCase() !== r.login && (
                <span className="text-muted">@{r.login}</span>
              )}
              <IconButton
                name="close"
                label={t('excl.remove')}
                size="sm"
                variant="ghost"
                wrapClassName="ml-auto"
                onClick={() => remove(r.login)}
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
