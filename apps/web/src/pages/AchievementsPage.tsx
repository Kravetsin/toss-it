import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NEBULA_MIN_PLAYED, type StatsSummary } from '@tmw/shared';
import { getStats } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { Card, Icon, Loader } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { NebulaBackground } from '@/components/NebulaBackground';
import { useChannels } from '@/features/dashboard/hooks/useChannels';

function Content({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">{children}</div>;
}

/** The galaxy page-background reward: preview + unlock condition + progress. Shown to everyone (even
 *  before earning) so the feature is never hidden — the same transparency as the shop's gated rungs. */
function NebulaAchievement({ aired, loading }: { aired: number; loading: boolean }) {
  const { t } = useI18n();
  const unlocked = aired >= NEBULA_MIN_PLAYED;
  const pct = Math.min(100, Math.round((aired / NEBULA_MIN_PLAYED) * 100));
  return (
    <Card className="overflow-hidden p-0">
      {/* Live preview of the real effect, centred in the box; slightly dimmed while still locked so
          the streamer sees exactly what they're working toward. The dimming wrapper is positioned
          (absolute) on purpose: a `filter`/opacity layer becomes the containing block for the
          absolute canvas, so a static wrapper would collapse it to zero height. */}
      <div className="relative h-48 bg-[#05080c]">
        <div className={`absolute inset-0 ${unlocked ? '' : 'opacity-60'}`}>
          <NebulaBackground fill="parent" cy={0.5} />
        </div>
        <span
          className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 label-mono ${
            unlocked ? 'bg-accent text-accent-contrast' : 'bg-surface-2/80 text-muted backdrop-blur'
          }`}
        >
          <Icon name={unlocked ? 'check' : 'clock'} size={12} />
          {unlocked ? t('achv.unlocked') : t('achv.locked')}
        </span>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <div>
          <h3 className="flex items-center gap-2 text-text">
            <Icon name="sparkles" size={16} className="text-accent" />
            {t('achv.nebulaName')}
          </h3>
          <p className="mt-1 text-sm text-muted">{t('achv.nebulaDesc')}</p>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted">{t('achv.condition', { n: NEBULA_MIN_PLAYED })}</span>
            <span className="tabular-nums text-text">
              {loading ? '…' : `${Math.min(aired, NEBULA_MIN_PLAYED)} / ${NEBULA_MIN_PLAYED}`}
            </span>
          </div>
          <span className="block h-2 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full bg-accent transition-[width] duration-500"
              style={{ width: `${loading ? 0 : pct}%` }}
            />
          </span>
          {!loading && !unlocked && (
            <p className="mt-1.5 text-xs text-muted">
              {t('achv.remaining', { n: NEBULA_MIN_PLAYED - aired })}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

export function AchievementsPage() {
  const { t } = useI18n();
  const { me, loading: meLoading } = useMe();
  const { channelsList, current, channelId, isOwner } = useChannels();
  const [stats, setStats] = useState<StatsSummary | null>(null);

  useEffect(() => {
    if (!channelId || !isOwner) return;
    setStats(null);
    let cancelled = false;
    // Totals are all-time regardless of the window, so the range is irrelevant here.
    void getStats(channelId, 14)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channelId, isOwner]);

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
          <AuthButtons returnTo="/dashboard/achievements" />
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

  return (
    <Content>
      <div className="mb-6 border-b border-border pb-4">
        <h1 className="flex items-center gap-2 text-2xl">
          <Icon name="trophy" size={22} className="text-accent" />
          {t('achv.title')}
        </h1>
        <p className="mt-1 text-sm text-muted">{t('achv.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NebulaAchievement aired={stats?.totalAired ?? 0} loading={!stats} />
      </div>
    </Content>
  );
}
