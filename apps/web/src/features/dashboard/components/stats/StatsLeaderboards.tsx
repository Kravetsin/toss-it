import { useCallback, useEffect, useRef, useState } from 'react';
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

/** Rows per request. Matches the server's default page (see the dashboard leaderboard route). */
const PAGE = 25;

/**
 * The owner's board: EVERYONE, not a top five — the public channel page shows ten, and a streamer
 * looking at their own stats was getting half of what their viewers can see.
 *
 * Paged as the reader scrolls rather than fetched whole: a busy channel has thousands of chatters,
 * each row carries the sender's cosmetics, and four of these load at once. A sentinel at the end of
 * the list pulls the next page; a short page means the board is finished.
 */
function Board({
  channelId,
  metric,
  period,
  icon,
  title,
  meId,
  formatValue,
}: {
  channelId: string;
  metric: LeaderboardMetric;
  period: StatsPeriod;
  icon: IconName;
  title: string;
  meId: string | null;
  formatValue: (v: number) => string;
}) {
  const { t } = useI18n();
  const { me } = useMe();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLOListElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  // Guards the loader against a second call while one is in flight — an IntersectionObserver fires
  // again on every scroll tick, and `entries.length` only moves once the response lands.
  const busy = useRef(false);
  const loadedFor = useRef('');

  const loadMore = useCallback(() => {
    if (busy.current || done) return;
    busy.current = true;
    const key = `${channelId}:${metric}:${period}`;
    void getOwnerLeaderboard(channelId, metric, period, PAGE, entries.length)
      .then((page) => {
        // The window can change while this is in flight; that answer belongs to the old board.
        if (loadedFor.current !== key) return;
        setEntries((prev) => [...prev, ...page]);
        if (page.length < PAGE) setDone(true);
      })
      .catch(() => setDone(true))
      .finally(() => {
        busy.current = false;
      });
  }, [channelId, metric, period, entries.length, done]);

  // A new window is a different board: drop what was loaded and fetch the first page STRAIGHT AWAY.
  // The first page is deliberately not left to the observer below — an IntersectionObserver only
  // reports while the page is actually compositing, so a board in a background tab (or one the
  // browser has not painted yet) would sit empty until something made it draw.
  useEffect(() => {
    const key = `${channelId}:${metric}:${period}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    busy.current = true;
    setEntries([]);
    setDone(false);
    void getOwnerLeaderboard(channelId, metric, period, PAGE, 0)
      .then((page) => {
        if (loadedFor.current !== key) return;
        setEntries(page);
        if (page.length < PAGE) setDone(true);
      })
      .catch(() => setDone(true))
      .finally(() => {
        busy.current = false;
      });
  }, [channelId, metric, period]);

  // Every page after the first: pulled by a sentinel at the end of the list as the reader scrolls.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || done || entries.length === 0) return;
    const io = new IntersectionObserver(
      (rows) => rows.some((r) => r.isIntersecting) && loadMore(),
      {
        root: scrollRef.current,
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, done, entries.length]);
  return (
    <Card className="flex h-full flex-col gap-2">
      <h3 className="flex shrink-0 items-center justify-between gap-2 label-mono text-text">
        <span className="flex items-center gap-2">
          <Icon name={icon} size={15} className="text-accent" />
          {title}
        </span>
        {entries.length > 0 && (
          <span className="tabular-nums text-muted">
            {entries.length}
            {done ? '' : '+'}
          </span>
        )}
      </h3>
      {entries.length === 0 && done ? (
        <p className="py-3 text-center text-sm text-muted">{t('lb.empty')}</p>
      ) : (
        <ol ref={scrollRef} className="-mr-1 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
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
          {/* Sits INSIDE the scroll box: the observer's root is the list, so a sentinel outside it
              would be "visible" from the start and pull every page at once. */}
          {!done && <li ref={sentinelRef} className="h-6 shrink-0" aria-hidden />}
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
      {/* Fixed row height: the boards fill different amounts and a stretching grid row left the
          shorter cards padded out with dead space. Each card scrolls its own list instead. */}
      <div className="grid auto-rows-[20rem] gap-4 sm:grid-cols-2">
        {METRICS.map((m) => (
          <Board
            key={m.key}
            channelId={channelId}
            metric={m.key}
            period={period}
            icon={m.icon}
            title={t(m.label)}
            meId={meId}
            formatValue={formatValue(m.key)}
          />
        ))}
      </div>
    </section>
  );
}
