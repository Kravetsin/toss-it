import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PAGE_BACKGROUNDS, type PageBackgroundDef, type StatsSummary } from '@tmw/shared';
import { getStats } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { Card, Icon, Loader } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { NebulaBackground } from '@/components/NebulaBackground';
import { BlackHoleBackground } from '@/components/BlackHoleBackground';
import { useChannels } from '@/features/dashboard/hooks/useChannels';

function Content({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">{children}</div>;
}

/** Live preview of a background effect, centred in its card. */
function bgPreview(id: string) {
  if (id === 'nebula') return <NebulaBackground fill="parent" cy={0.5} />;
  if (id === 'blackhole') return <BlackHoleBackground fill="parent" cy={0.5} />;
  return null;
}

/** A page-background reward: live preview + unlock condition + progress. Shown to everyone (even
 *  before earning) so the feature is never hidden — the same transparency as the shop's gated rungs. */
function BackgroundAchievement({
  def,
  aired,
  loading,
}: {
  def: PageBackgroundDef;
  aired: number;
  loading: boolean;
}) {
  const { t } = useI18n();
  const unlocked = aired >= def.minPlayed;
  const pct = Math.min(100, Math.round((aired / def.minPlayed) * 100));
  return (
    <Card className="overflow-hidden p-0">
      {/* Live preview, centred; dimmed while still locked so the streamer sees what they're after. The
          dimming wrapper is positioned (absolute) on purpose: a `filter`/opacity layer becomes the
          containing block for the absolute canvas, so a static wrapper would collapse it to zero. */}
      <div className="relative h-48 bg-[#05080c]">
        <div className={`absolute inset-0 ${unlocked ? '' : 'opacity-60'}`}>
          {bgPreview(def.id)}
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
            {t(`bg.${def.id}`)}
          </h3>
          <p className="mt-1 text-sm text-muted">{t(`achv.${def.id}Desc`)}</p>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted">{t('achv.condition', { n: def.minPlayed })}</span>
            <span className="tabular-nums text-text">
              {loading ? '…' : `${Math.min(aired, def.minPlayed)} / ${def.minPlayed}`}
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
              {t('achv.remaining', { n: def.minPlayed - aired })}
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
        {PAGE_BACKGROUNDS.map((def) => (
          <BackgroundAchievement
            key={def.id}
            def={def}
            aired={stats?.totalAired ?? 0}
            loading={!stats}
          />
        ))}
      </div>
    </Content>
  );
}
