import { useEffect, useState } from 'react';
import {
  levelTier,
  toRoman,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod,
} from '@tmw/shared';
import { getLeaderboard } from '@/lib/api';
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

const TOP_N = 5;

function MiniBoard({
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
      <h3 className="flex items-center gap-2 label-mono text-text">
        <Icon name={icon} size={15} className="text-accent" />
        {title}
      </h3>
      {entries.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted">{t('lb.empty')}</p>
      ) : (
        <ol className="flex flex-col">
          {entries.slice(0, TOP_N).map((e, i) => {
            const isYou = e.userId === meId;
            const mine = isYou ? me?.user?.equipped : undefined;
            const nick = nickProps(
              mine ? (mine.nickColor ?? null) : e.nickColor,
              mine ? (mine.nickEffect ?? null) : e.nickEffect,
            );
            const tier = e.level ? levelTier(e.level) : null;
            return (
              <li
                key={e.userId}
                className={`flex items-center gap-2 px-1 py-1.5 text-sm ${isYou ? 'bg-accent-soft' : ''}`}
              >
                <span className="w-4 shrink-0 text-center text-xs tabular-nums text-muted">
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

/** Streamer-facing leaderboards: all four boards at a glance (compact top-5), shared period toggle. */
export function StatsLeaderboards({ login, meId }: { login: string; meId: string | null }) {
  const { t } = useI18n();
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [boards, setBoards] = useState<Record<LeaderboardMetric, LeaderboardEntry[]>>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      METRICS.map((m) =>
        getLeaderboard(login, m.key, period)
          .then((b) => [m.key, b] as const)
          .catch(() => [m.key, []] as const),
      ),
    ).then((pairs) => {
      if (!cancelled) setBoards({ ...EMPTY, ...Object.fromEntries(pairs) });
    });
    return () => {
      cancelled = true;
    };
  }, [login, period]);

  const formatValue = (metric: LeaderboardMetric) => (v: number) => {
    if (metric !== 'watch') return String(v);
    const h = Math.floor(v / 60);
    const m = v % 60;
    return h > 0 ? t('dur.hourMin', { h, m }) : t('dur.min', { n: m });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display">
          <Icon name="trophy" size={16} className="text-warn" />
          {t('channel.leaderboard')}
        </h2>
        <div className="flex gap-1 border border-border bg-surface-2 p-1">
          {(['month', 'all'] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`rounded-none px-2.5 py-1 label-mono transition-colors duration-200 ease-out ${
                period === p ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
              }`}
            >
              {t(p === 'month' ? 'lb.month' : 'lb.all')}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {METRICS.map((m) => (
          <MiniBoard
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
