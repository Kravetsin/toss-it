import { useState } from 'react';
import { Link } from 'react-router-dom';
import { removeBan, removeFromWhitelist, saveSettings } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useI18n } from '@/i18n';
import { Card, Drawer, Loader } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { DashboardTopbar } from '@/features/dashboard/components/DashboardTopbar';
import { NowPlayingCard } from '@/features/dashboard/components/NowPlayingCard';
import { ModerationQueue } from '@/features/dashboard/components/ModerationQueue';
import { MembersPanel } from '@/features/dashboard/components/MembersPanel';
import { HistoryCard } from '@/features/dashboard/components/HistoryCard';
import { useChannels } from '@/features/dashboard/hooks/useChannels';
import { useChannelData } from '@/features/dashboard/hooks/useChannelData';
import { useSoundNotify } from '@/features/dashboard/hooks/useSoundNotify';
import { useTabTitleBadge } from '@/features/dashboard/hooks/useTabTitleBadge';
import { useModerationActions } from '@/features/dashboard/hooks/useModerationActions';

/** Контентная обёртка дашборда внутри оболочки (AppShell даёт фон/каркас). */
function Content({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</div>;
}

export function DashboardPage() {
  const { t } = useI18n();
  const act = useApiAction();
  const { me, loading: meLoading } = useMe();
  const { channelsList, list, current, channelId, isOwner, setCurrentId } = useChannels();
  const sound = useSoundNotify();
  const data = useChannelData(channelId, isOwner, sound.soundOnRef);
  const [historyOpen, setHistoryOpen] = useState(false);
  const actions = useModerationActions({
    channelId,
    current,
    refreshLists: data.refreshLists,
  });

  useTabTitleBadge(data.pending.length);

  const bannedIds = new Set(data.banned.map((b) => b.userId));

  if (meLoading || channelsList === 'loading')
    return (
      <Content>
        <Loader label={t('common.loading')} />
      </Content>
    );

  if (!me?.user) {
    return (
      <Content>
        <Card className="mx-auto flex max-w-md flex-col items-center gap-4 py-10 text-center">
          <p className="text-muted">{t('dash.loginToView')}</p>
          <AuthButtons returnTo="/dashboard" />
        </Card>
      </Content>
    );
  }

  if (!current) {
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
  }

  const accepting = isOwner && data.settings ? data.settings.accepting : null;

  return (
    <Content>
      <DashboardTopbar
        list={list}
        current={current}
        channelId={channelId}
        onSelect={setCurrentId}
        soundOn={sound.soundOn}
        onToggleSound={sound.toggle}
        accepting={accepting}
        onToggleAccepting={(v) =>
          void act(async () => data.setSettings(await saveSettings(channelId!, { accepting: v })), {
            success: t('toast.saved'),
          })
        }
        onOpenHistory={() => setHistoryOpen(true)}
      />

      {/* Раскладка: mobile/планшет = NowPlaying → очередь → участники;
          desktop (lg+) = двухколоночная сетка (очередь слева, NowPlaying+участники справа sticky).
          NowPlaying рендерится дважды: мобильная копия (lg:hidden, не занимает grid-ячейку)
          и десктопная (hidden lg:block внутри правой колонки). */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* NowPlaying — только мобильный, над очередью */}
        <div className="lg:hidden">
          <NowPlayingCard
            now={data.now}
            isOwner={isOwner}
            onSkip={actions.skip}
            onSendTest={actions.sendTest}
          />
        </div>

        {/* Очередь — левая колонка на десктопе */}
        <div className="min-w-0">
          <ModerationQueue
            pending={data.pending}
            reputation={data.reputation}
            onApprove={actions.onApprove}
            onTrust={actions.onTrust}
            onReject={actions.onReject}
            onBan={actions.onBan}
          />
        </div>

        {/* Правая колонка: NowPlaying (десктоп) + участники; sticky */}
        <div className="flex min-w-0 flex-col gap-4 self-start lg:sticky lg:top-20">
          <div className="hidden lg:block">
            <NowPlayingCard
              now={data.now}
              isOwner={isOwner}
              onSkip={actions.skip}
              onSendTest={actions.sendTest}
            />
          </div>
          <MembersPanel
            allowed={data.allowed}
            banned={data.banned}
            onRemoveAllowed={(id) =>
              channelId &&
              void act(() => removeFromWhitelist(channelId, id), {
                after: data.refreshLists,
                success: t('toast.removed'),
              })
            }
            onRemoveBan={(id) =>
              channelId &&
              void act(() => removeBan(channelId, id), {
                after: data.refreshLists,
                success: t('toast.removed'),
              })
            }
            onBanAllowed={(id, name) => actions.banById(id, name)}
          />
        </div>
      </div>

      <Drawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={t('dash.history')}
        closeLabel={t('common.close')}
        width="max-w-xl"
      >
        <HistoryCard history={data.history} bannedIds={bannedIds} onBan={actions.banById} />
      </Drawer>
    </Content>
  );
}
