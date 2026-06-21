import type { LeaderboardEntry } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card } from '@/ui';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';
import { StarMark } from '@/components/StarMark';
import { CosmosLegend } from '@/features/channel/components/CosmosLegend';

export function Leaderboard({ board, meId }: { board: LeaderboardEntry[]; meId: string | null }) {
  const { t } = useI18n();
  const totalShown = board.reduce((sum, e) => sum + e.count, 0);
  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2 font-display">
          <Icon name="trophy" size={16} className="text-warn" />
          {t('channel.leaderboard')}
        </h2>
        <CosmosLegend count={totalShown} className="ml-auto" />
      </div>
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
                  <b
                    className={isYou ? 'text-accent' : 'text-text'}
                    style={e.nickColor ? { color: e.nickColor } : undefined}
                  >
                    {e.displayName}
                  </b>
                  <PlatformIcon userId={e.userId} size={13} />
                  <UserBadges isFounder={e.isFounder} variant="icons" />
                  {isYou && <span className="label-mono text-accent">{t('channel.you')}</span>}
                  <span className="ml-auto flex items-center gap-1.5 text-muted">
                    <StarMark size={13} className="text-accent" />
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
