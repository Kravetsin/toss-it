import { Link } from 'react-router-dom';
import { removeBan, removeFromWhitelist, saveSettings } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useI18n } from '@/i18n';
import { Card, Loader, PageShell } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { DashboardHeader } from '@/features/dashboard/components/DashboardHeader';
import { ChannelSwitcher } from '@/features/dashboard/components/ChannelSwitcher';
import { NowPlayingCard } from '@/features/dashboard/components/NowPlayingCard';
import { SettingsCard } from '@/features/dashboard/components/SettingsCard';
import { ModerationQueue } from '@/features/dashboard/components/ModerationQueue';
import { UserList } from '@/features/dashboard/components/UserList';
import { HistoryCard } from '@/features/dashboard/components/HistoryCard';
import { useChannels } from '@/features/dashboard/hooks/useChannels';
import { useChannelData } from '@/features/dashboard/hooks/useChannelData';
import { useSoundNotify } from '@/features/dashboard/hooks/useSoundNotify';
import { useQueueView } from '@/features/dashboard/hooks/useQueueView';
import { useTabTitleBadge } from '@/features/dashboard/hooks/useTabTitleBadge';
import { useModerationActions } from '@/features/dashboard/hooks/useModerationActions';

export function DashboardPage() {
  const { t } = useI18n();
  const act = useApiAction();
  const { me, loading: meLoading } = useMe();
  const { channelsList, list, current, channelId, isOwner, setCurrentId } = useChannels();
  const sound = useSoundNotify();
  const data = useChannelData(channelId, isOwner, sound.soundOnRef);
  const [queueView, setQueueView] = useQueueView();
  const actions = useModerationActions({
    channelId,
    current,
    refreshLists: data.refreshLists,
    setPending: data.setPending,
  });

  useTabTitleBadge(data.pending.length);

  const bannedIds = new Set(data.banned.map((b) => b.userId));

  if (meLoading || channelsList === 'loading')
    return (
      <PageShell maxWidth="3xl">
        <Loader label={t('common.loading')} />
      </PageShell>
    );

  if (!me?.user) {
    return (
      <PageShell maxWidth="3xl">
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-muted">{t('dash.loginToView')}</p>
          <AuthButtons returnTo="/dashboard" />
        </Card>
      </PageShell>
    );
  }

  if (!current) {
    return (
      <PageShell maxWidth="3xl">
        <p className="text-muted">
          {t('dash.createFirstPre')}
          <Link to="/" className="text-twitch-light underline">
            {t('dash.createFirstLink')}
          </Link>
          .
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell maxWidth="3xl">
      <DashboardHeader
        isFounder={me.user.isFounder}
        soundOn={sound.soundOn}
        onToggleSound={sound.toggle}
      />

      <ChannelSwitcher list={list} current={current} channelId={channelId} onSelect={setCurrentId} />

      <NowPlayingCard
        now={data.now}
        isOwner={isOwner}
        onSkip={actions.skip}
        onSendTest={actions.sendTest}
      />

      {isOwner && data.settings && channelId && (
        <SettingsCard
          settings={data.settings}
          onSave={(patch) =>
            void act(async () => data.setSettings(await saveSettings(channelId, patch)), {
              success: t('toast.saved'),
            })
          }
        />
      )}

      <ModerationQueue
        pending={data.pending}
        allowed={data.allowed}
        reputation={data.reputation}
        view={queueView}
        onView={setQueueView}
        onApprove={actions.onApprove}
        onTrust={actions.onTrust}
        onReject={actions.onReject}
        onBan={actions.onBan}
        onLater={actions.onLater}
      />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <UserList
          icon="star"
          title={t('dash.whitelist')}
          hint={t('dash.whitelistHint')}
          users={data.allowed}
          onRemove={(id) =>
            channelId &&
            void act(() => removeFromWhitelist(channelId, id), {
              after: data.refreshLists,
              success: t('toast.removed'),
            })
          }
          onBan={(id, name) => actions.banById(id, name)}
        />
        <UserList
          icon="user-x"
          title={t('dash.bans')}
          hint={t('dash.bansHint')}
          users={data.banned}
          onRemove={(id) =>
            channelId &&
            void act(() => removeBan(channelId, id), {
              after: data.refreshLists,
              success: t('toast.removed'),
            })
          }
        />
      </div>

      <HistoryCard history={data.history} bannedIds={bannedIds} onBan={actions.banById} />
    </PageShell>
  );
}
