import { useCallback, useEffect, useState } from 'react';
import {
  LEVEL_GLOW_FROM,
  levelTier,
  toRoman,
  type EquippedCosmetics,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod,
} from '@tmw/shared';
import { getLeaderboard } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { Icon, type IconName } from '@/ui/icons';
import { Card } from '@/ui';
import { PlatformIcon, UserBadges } from '@/components/UserMarks';
import { CardEffect } from '@/components/CardEffect';
import { nickProps } from '@/lib/nick';
import { StarMark } from '@/components/StarMark';
import { CosmosLegend } from '@/features/channel/components/CosmosLegend';

const METRIC_TABS: { key: LeaderboardMetric; icon: IconName; label: string }[] = [
  { key: 'sends', icon: 'send', label: 'lb.sends' },
  { key: 'messages', icon: 'message-circle', label: 'lb.messages' },
  { key: 'watch', icon: 'clock', label: 'lb.watch' },
  { key: 'level', icon: 'star', label: 'lb.level' },
];

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-none px-2 py-1.5 label-mono transition-colors duration-200 ease-out ${
        active ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
      }`}
    >
      <Icon name={icon} size={14} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * One leaderboard row. Split out of the list so the gallery can stand a REAL row on a bench instead
 * of a lookalike — a copy would drift from this the first time either is touched, and a bench that
 * lies is worse than no bench. Everything it needs arrives as props; it fetches nothing.
 */
export function LeaderboardRow({
  entry,
  rank,
  metric,
  isYou = false,
  cosmetics,
}: {
  entry: LeaderboardEntry;
  /** 1-based; the top three wear the accent badge. */
  rank: number;
  metric: LeaderboardMetric;
  isYou?: boolean;
  /**
   * Overrides the entry's own cosmetics. The list passes the live equipped state for YOUR row, so it
   * reflects an equip immediately instead of the snapshot fetched at page load; the gallery passes
   * whatever its switcher is set to.
   */
  cosmetics?: EquippedCosmetics;
}) {
  const { t } = useI18n();
  const e = entry;
  const formatValue = (value: number): string => {
    if (metric !== 'watch') return String(value);
    const h = Math.floor(value / 60);
    const m = value % 60;
    return h > 0 ? t('dur.hourMin', { h, m }) : t('dur.min', { n: m });
  };
  const mine = cosmetics;
  const cardEffect = mine ? (mine.cardEffect ?? null) : e.cardEffect;
  const nick = nickProps({
    color: mine ? mine.nickColor : e.nickColor,
    color2: mine ? mine.nickColor2 : e.nickColor2,
    flow: mine ? mine.nickFlow : e.nickFlow,
    effect: mine ? mine.nickEffect : e.nickEffect,
  });
  const tier = e.level ? levelTier(e.level) : null;
  const levelGlow = !!tier && (e.level ?? 0) >= LEVEL_GLOW_FROM;
  return (
    <li className="relative">
      <CardEffect effect={cardEffect} compact />
      {tier && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 z-[1] w-[3px] ${tier.iris ? 'lvl-iris' : ''}`}
          style={{
            background: tier.color,
            boxShadow: levelGlow ? `0 0 7px ${tier.color}` : undefined,
          }}
        />
      )}
      <div
        className={`relative flex items-center gap-3 px-2 py-2 ${isYou ? 'bg-accent-soft' : ''}`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${
            rank <= 3 ? 'border-accent bg-accent text-accent-contrast' : 'border-border text-muted'
          }`}
        >
          {rank}
        </span>
        {tier && (
          <span
            className={`shrink-0 text-xs font-bold ${tier.iris ? 'lvl-iris' : ''}`}
            style={{
              color: tier.color,
              textShadow: levelGlow ? `0 0 6px ${tier.color}` : undefined,
            }}
          >
            {toRoman(e.level!)}
          </span>
        )}
        <b
          className={`${isYou ? 'text-accent' : 'text-text'} ${nick.className}`}
          style={nick.style}
        >
          {e.displayName}
        </b>
        <PlatformIcon userId={e.userId} size={13} />
        <UserBadges isFounder={e.isFounder} variant="icons" />
        {isYou && <span className="label-mono text-accent">{t('channel.you')}</span>}
        {/* Level tab: the rank rail + Roman numeral already show the level — no value. */}
        {metric !== 'level' && (
          <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap text-muted">
            {metric === 'sends' ? (
              <StarMark size={13} className="text-accent" />
            ) : (
              <Icon
                name={METRIC_TABS.find((m) => m.key === metric)!.icon}
                size={13}
                className="text-accent"
              />
            )}
            {formatValue(e.value)}
          </span>
        )}
      </div>
    </li>
  );
}

/** Per-channel leaderboard: sends / chat messages / watch time / level, month or all-time. */
export function Leaderboard({
  login,
  meId,
  refreshKey,
}: {
  login: string;
  meId: string | null;
  refreshKey: number;
}) {
  const { t } = useI18n();
  const { me } = useMe();
  const [metric, setMetric] = useState<LeaderboardMetric>('sends');
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);

  const load = useCallback(() => {
    void getLeaderboard(login, metric, period)
      .then(setBoard)
      .catch(() => {});
  }, [login, metric, period]);

  // refreshKey bumps after the viewer's own send; the interval beats WizeBot's 15 min.
  useEffect(() => {
    load();
  }, [load, refreshKey]);
  useEffect(() => {
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const totalShown = board.reduce((sum, e) => sum + e.value, 0);
  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="flex items-center gap-2 font-display">
          <Icon name="trophy" size={16} className="text-warn" />
          {t('channel.leaderboard')}
        </h2>
        {/* Cosmos stars mirror shows on stream — only the sends metric. */}
        {metric === 'sends' && <CosmosLegend count={totalShown} className="ml-auto" />}
      </div>

      {/* Tabs span the full width on their own row; the period switch sits below —
          consistent across languages (longer EN labels used to wrap unevenly). */}
      <div className="mb-3 flex flex-col gap-2">
        <div className="flex gap-1 border border-border bg-surface-2 p-1">
          {METRIC_TABS.map((tab) => (
            <TabBtn
              key={tab.key}
              active={metric === tab.key}
              onClick={() => setMetric(tab.key)}
              icon={tab.icon}
              label={t(tab.label)}
            />
          ))}
        </div>
        <div className="flex gap-1 self-start border border-border bg-surface-2 p-1">
          {(['month', 'all'] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`rounded-none px-2.5 py-1.5 label-mono transition-colors duration-200 ease-out ${
                period === p ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
              }`}
            >
              {t(p === 'month' ? 'lb.month' : 'lb.all')}
            </button>
          ))}
        </div>
      </div>

      {board.length === 0 ? (
        <p className="text-muted">
          {t(metric === 'sends' ? 'channel.leaderboardEmpty' : 'lb.empty')}
        </p>
      ) : (
        <Card>
          <ol className="flex flex-col gap-1.5">
            {board.map((e, i) => {
              const isYou = e.userId === meId;
              return (
                <LeaderboardRow
                  key={e.userId}
                  entry={e}
                  rank={i + 1}
                  metric={metric}
                  isYou={isYou}
                  // Optimistic: your own row reflects your live equipped cosmetics (updated on
                  // equip) rather than the snapshot fetched at page load — no refresh needed.
                  cosmetics={isYou ? me?.user?.equipped : undefined}
                />
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}
