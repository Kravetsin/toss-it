import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { MediaKind, StatsSummary } from '@tmw/shared';
import { getStats } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { Card, Icon, Loader, type IconName } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { useChannels } from '@/features/dashboard/hooks/useChannels';
import { StatBarChart, type BarPoint } from '@/features/dashboard/components/stats/StatBarChart';
import { LivePresenceCard } from '@/features/dashboard/components/stats/LivePresenceCard';
import { StatsLeaderboards } from '@/features/dashboard/components/stats/StatsLeaderboards';

function Content({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</div>;
}

const RANGES = [7, 14, 30] as const;

const KIND_ICON: Record<MediaKind, IconName> = {
  image: 'image',
  gif: 'image',
  video: 'play',
  youtube: 'play',
  audio: 'volume-2',
  text: 'message-circle',
};

function Kpi({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 label-mono text-muted">
        <Icon name={icon} size={14} className="text-accent" />
        {label}
      </span>
      <span className="text-2xl tabular-nums text-text">{value}</span>
    </Card>
  );
}

function KindBreakdown({ byKind }: { byKind: StatsSummary['byKind'] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...byKind.map((k) => k.count));
  return (
    <Card className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 label-mono text-text">
        <Icon name="image" size={15} className="text-accent" />
        {t('stats.byKind')}
      </h3>
      {byKind.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted">{t('stats.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {byKind.map((k) => (
            <li key={k.kind} className="flex items-center gap-2 text-sm">
              <Icon name={KIND_ICON[k.kind]} size={14} className="shrink-0 text-muted" />
              <span className="w-16 shrink-0 text-muted">{t(`stats.kind.${k.kind}`)}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${(k.count / max) * 100}%` }}
                />
              </span>
              <span className="w-10 shrink-0 text-right tabular-nums text-text">{k.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function StatsPage() {
  const { t } = useI18n();
  const { me, loading: meLoading } = useMe();
  const { channelsList, current, channelId, isOwner } = useChannels();
  const [days, setDays] = useState<number>(14);
  const [stats, setStats] = useState<StatsSummary | null>(null);

  useEffect(() => {
    if (!channelId || !isOwner) return;
    setStats(null);
    let cancelled = false;
    void getStats(channelId, days)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channelId, isOwner, days]);

  if (meLoading || channelsList === 'loading')
    return (
      <Content>
        <Loader label={t('common.loading')} />
      </Content>
    );

  if (!me?.user)
    return (
      <Content>
        <Card className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
          <p className="text-muted">{t('dash.loginToView')}</p>
          <AuthButtons returnTo="/dashboard/stats" />
        </Card>
      </Content>
    );

  if (!current || !channelId)
    return (
      <Content>
        <p className="text-muted">
          {t('dash.createFirstPre')}
          <Link to="/" className="text-accent underline">
            {t('dash.createFirstLink')}
          </Link>
          .
        </p>
      </Content>
    );

  if (!isOwner)
    return (
      <Content>
        <Card className="mx-auto max-w-md py-8 text-center text-muted">{t('stats.ownerOnly')}</Card>
      </Content>
    );

  const fmtHours = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? t('dur.hourMin', { h, m }) : t('dur.min', { n: m });
  };

  const dayShort = (iso: string) => iso.slice(8, 10); // 'DD'
  const subPoints: BarPoint[] =
    stats?.daily.map((d) => ({
      label: d.day,
      short: dayShort(d.day),
      value: d.submissions,
      sub: d.aired,
    })) ?? [];
  const msgPoints: BarPoint[] =
    stats?.daily.map((d) => ({ label: d.day, short: dayShort(d.day), value: d.messages })) ?? [];
  const watchPoints: BarPoint[] =
    stats?.daily.map((d) => ({ label: d.day, short: dayShort(d.day), value: d.watchMinutes })) ??
    [];

  return (
    <Content>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <h1 className="flex items-center gap-2 text-2xl">
          <Icon name="chart" size={22} className="text-accent" />
          {t('stats.title')}
        </h1>
        <div className="flex gap-1 border border-border bg-surface-2 p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={days === r}
              onClick={() => setDays(r)}
              className={`rounded-none px-2.5 py-1 label-mono transition-colors duration-200 ease-out ${
                days === r ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-text'
              }`}
            >
              {t('stats.days', { n: r })}
            </button>
          ))}
        </div>
      </div>

      {!stats ? (
        <Loader label={t('common.loading')} />
      ) : (
        <div className="flex flex-col gap-8">
          {/* Overview KPIs */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Kpi
              icon="send"
              label={t('stats.totalSubmissions')}
              value={String(stats.totalSubmissions)}
            />
            <Kpi icon="play" label={t('stats.aired')} value={String(stats.totalAired)} />
            <Kpi icon="clock" label={t('stats.month')} value={String(stats.monthSubmissions)} />
            <Kpi icon="sparkles" label={t('stats.today')} value={String(stats.todaySubmissions)} />
            <Kpi
              icon="trophy"
              label={t('stats.contributors')}
              value={String(stats.uniqueContributors)}
            />
            <Kpi
              icon="message-circle"
              label={t('stats.monthMessages')}
              value={String(stats.monthMessages)}
            />
            <Kpi
              icon="clock"
              label={t('stats.monthWatch')}
              value={fmtHours(stats.monthWatchMinutes)}
            />
          </div>

          {/* Daily activity charts + live presence */}
          <div className="grid gap-4 lg:grid-cols-2">
            <StatBarChart
              title={t('stats.submissionsPerDay')}
              icon="send"
              points={subPoints}
              subLabel={t('stats.aired').toLowerCase()}
              total={stats.daily.reduce((s, d) => s + d.submissions, 0)}
            />
            <LivePresenceCard channelId={channelId} />
            <StatBarChart
              title={t('stats.messagesPerDay')}
              icon="message-circle"
              points={msgPoints}
            />
            <StatBarChart
              title={t('stats.watchPerDay')}
              icon="clock"
              points={watchPoints}
              formatValue={fmtHours}
              total={stats.daily.reduce((s, d) => s + d.watchMinutes, 0)}
            />
          </div>

          <KindBreakdown byKind={stats.byKind} />

          <StatsLeaderboards login={current.login} meId={me.user.id} />
        </div>
      )}
    </Content>
  );
}
