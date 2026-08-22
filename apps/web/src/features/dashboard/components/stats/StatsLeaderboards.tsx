import { useEffect, useState } from 'react';
import {
  levelTier,
  toRoman,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type StatsPeriod,
} from '@tmw/shared';
import { getOwnerLeaderboard } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { Card, Icon, type IconName } from '@/ui';
import { nickProps } from '@/lib/nick';

const METRICS: { key: LeaderboardMetric; icon: IconName; label: string }[] = [
  { key: 'sends', icon: 'send', label: 'lb.sends' },
  { key: 'messages', icon: 'message-circle', label: 'lb.messages' },
  { key: 'watch', icon: 'clock', label: 'lb.watch' },
  { key: 'level', icon: 'star', label: 'lb.level' },
];

const EMPTY: Record<LeaderboardMetric, LeaderboardEntry[]> = {
  sends: [],
  messages: [],
  watch: [],
  level: [],
};

/**
 * The owner's board: EVERYONE, not a top five. The public channel page shows ten, and a streamer
 * looking at their own stats was getting half of what their viewers can see. Past a screenful the
 * list scrolls inside its card, so four boards still fit on one page.
 */
function Board({
  metric,
  icon,
  title,
  entries,
  meId,
  formatValue,
}: {
  metric: LeaderboardMetric;
  icon: IconName;
  title: string;
  entries: LeaderboardEntry[];
  meId: string | null;
  formatValue: (v: number) => string;
}) {
  const { t } = useI18n();
  const { me } = useMe();
  return (
    <Card className="flex flex-col gap-2">
      <h3 className="flex items-center justify-between gap-2 label-mono text-text">
        <span className="flex items-center gap-2">
          <Icon name={icon} size={15} className="text-accent" />
          {title}
        </span>
        {entries.length > 0 && <span className="tabular-nums text-muted">{entries.length}</span>}
      </h3>
      {entries.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted">{t('lb.empty')}</p>
      ) : (
        <ol className="-mr-1 flex max-h-72 flex-col overflow-y-auto pr-1">
          {entries.map((e, i) => {
            const isYou = e.userId === meId;
            const mine = isYou ? me?.user?.equipped : undefined;
            const nick = nickProps({
              color: mine ? mine.nickColor : e.nickColor,
              color2: mine ? mine.nickColor2 : e.nickColor2,
              flow: mine ? mine.nickFlow : e.nickFlow,
              effect: mine ? mine.nickEffect : e.nickEffect,
            });
            const tier = e.level ? levelTier(e.level) : null;
            return (
              <li
                key={e.userId}
                className={`flex items-center gap-2 px-1 py-1.5 text-sm ${isYou ? 'bg-accent-soft' : ''}`}
              >
                <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted">
                  {i + 1}
                </span>
                {tier && (
                  <span className="shrink-0 text-xs font-bold" style={{ color: tier.color }}>
                    {toRoman(e.level!)}
                  </span>
                )}
                <b
                  className={`min-w-0 flex-1 truncate ${isYou ? 'text-accent' : 'text-text'} ${nick.className}`}
                  style={nick.style}
                >
                  {e.displayName}
                </b>
                {metric !== 'level' && (
                  <span className="shrink-0 tabular-nums text-muted">{formatValue(e.value)}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/**
 * Streamer-facing leaderboards: all four boards at a glance. The window comes from the PAGE — the
 * section used to carry a period toggle of its own, which left two unrelated switches on one screen
 * and was half of why the page looked like it ignored the one at the top.
 */
export function StatsLeaderboards({
  channelId,
  meId,
  period,
}: {
  channelId: string;
  meId: string | null;
  period: StatsPeriod;
}) {
  const { t } = useI18n();
  const [boards, setBoards] = useState<Record<LeaderboardMetric, LeaderboardEntry[]>>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      METRICS.map((m) =>
        getOwnerLeaderboard(channelId, m.key, period)
          .then((b) => [m.key, b] as const)
          .catch(() => [m.key, []] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setBoards({ ...EMPTY, ...Object.fromEntries(pairs) });
    });
    return () => {
      cancelled = true;
    };
  }, [channelId, period]);

  const formatValue = (metric: LeaderboardMetric) => (v: number) => {
    if (metric !== 'watch') return String(v);
    const h = Math.floor(v / 60);
    const m = v % 60;
    return h > 0 ? t('dur.hourMin', { h, m }) : t('dur.min', { n: m });
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 font-display">
        <Icon name="trophy" size={16} className="text-warn" />
        {t('channel.leaderboard')}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {METRICS.map((m) => (
          <Board
            key={m.key}
            metric={m.key}
            icon={m.icon}
            title={t(m.label)}
            entries={boards[m.key]}
            meId={meId}
            formatValue={formatValue(m.key)}
          />
        ))}
      </div>
    </section>
  );
}
