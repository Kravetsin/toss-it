import type { LeaderboardEntry } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card } from '@/ui';

/** Таблица лидеров канала с подсветкой текущего пользователя. */
export function Leaderboard({ board, meId }: { board: LeaderboardEntry[]; meId: string | null }) {
  const { t } = useI18n();
  return (
    <div className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 font-display">
        <Icon name="trophy" size={16} className="text-warn" />
        {t('channel.leaderboard')}
      </h2>
      {board.length === 0 ? (
        <p className="text-muted">{t('channel.leaderboardEmpty')}</p>
      ) : (
        <Card>
          <ol className="flex flex-col gap-1.5">
            {board.map((e, i) => {
              const isYou = e.userId === meId;
              return (
                <li
                  key={e.userId}
                  className={`flex items-center gap-3 px-2 py-1 ${isYou ? 'bg-accent-soft' : ''}`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
                      i < 3
                        ? 'border-accent bg-accent text-accent-contrast'
                        : 'border-border text-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <b className={isYou ? 'text-accent' : 'text-text'}>{e.displayName}</b>
                  {isYou && <span className="label-mono text-accent">{t('channel.you')}</span>}
                  <span className="ml-auto flex items-center gap-1.5 text-muted">
                    <Icon name="image" size={15} />
                    {e.count}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}
