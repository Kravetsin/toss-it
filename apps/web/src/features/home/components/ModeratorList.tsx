import type { ListedUser } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Tooltip } from '@/ui';

/** Список модераторов канала с кнопкой удаления. */
export function ModeratorList({
  mods,
  onRemove,
}: {
  mods: ListedUser[];
  onRemove: (userId: string) => void;
}) {
  const { t } = useI18n();
  if (mods.length === 0) {
    return <p className="text-sm text-muted">{t('dash.noModerators')}</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {mods.map((m) => (
        <li key={m.userId} className="flex items-center gap-2 text-muted">
          <Icon name="shield" size={15} className="text-accent" />
          <b className="text-text">{m.displayName}</b>
          <span className="text-xs">{m.login}</span>
          <Tooltip content={t('dash.removeUser')} align="end" focusable={false} className="ml-auto">
            <button
              type="button"
              onClick={() => onRemove(m.userId)}
              className="cursor-pointer rounded-full text-faint outline-none transition-colors duration-[120ms] ease-out hover:text-danger focus-visible:[box-shadow:var(--shadow-focus)]"
            >
              <Icon name="close" size={16} />
            </button>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
