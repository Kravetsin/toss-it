import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ChannelSettings } from '@tmw/shared';
import {
  reloadOverlay,
  removeBan,
  removeFromWhitelist,
  saveSettings,
  seekPlayback,
  setContentVolume,
  setMusicConfig as saveMusicConfig,
} from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useI18n } from '@/i18n';
import { Card, Drawer, Loader } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { DashboardTopbar } from '@/features/dashboard/components/DashboardTopbar';
import { TeamCard } from '@/features/home/components/TeamCard';
import { NowPlayingCard } from '@/features/dashboard/components/NowPlayingCard';
import { QueueCard } from '@/features/dashboard/components/QueueCard';
import { TestSendModal } from '@/features/dashboard/components/TestSendModal';
import { MusicPlayerCard } from '@/features/dashboard/components/MusicPlayerCard';
import { ModerationQueue } from '@/features/dashboard/components/ModerationQueue';
import { ModerationSettings } from '@/features/dashboard/components/ModerationSettings';
import { SubmissionLimits } from '@/features/dashboard/components/SubmissionLimits';
import { MembersPanel } from '@/features/dashboard/components/MembersPanel';
import { useChannels } from '@/features/dashboard/hooks/useChannels';
import { useChannelData } from '@/features/dashboard/hooks/useChannelData';
import { useModerationActions } from '@/features/dashboard/hooks/useModerationActions';
import { useNotifications } from '@/providers/NotificationsProvider';

function Content({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-6xl px-4 py-6 lg:px-8">{children}</div>;
}

export function DashboardPage() {
  const { t } = useI18n();
  const act = useApiAction();
  const { me, loading: meLoading } = useMe();
  const { channelsList, list, current, channelId, isOwner, setCurrentId } = useChannels();
  const { soundOnRef } = useNotifications();
  const data = useChannelData(channelId, isOwner, soundOnRef);
  const [testOpen, setTestOpen] = useState(false);
  const [modSettingsOpen, setModSettingsOpen] = useState(false);
  const actions = useModerationActions({
    channelId,
    refreshLists: data.refreshLists,
  });

  // Now-playing content-volume slider (owner + mods). One channel-wide value drives both stage
  // cards, so it lives here: every drag step updates it at once (both sliders follow), while the
  // commit (persist + live push) is debounced until the streamer settles. The echoed volume only
  // syncs settings — writing it back to the slider would fight a drag still in progress.
  const volTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(volTimer.current), []);
  const onContentVolume = (v: number) => {
    if (!channelId) return;
    data.setContentVolume(v);
    window.clearTimeout(volTimer.current);
    volTimer.current = window.setTimeout(() => {
      void setContentVolume(channelId, v)
        .then((r) => {
          const applied = typeof r.volume === 'number' ? r.volume : v;
          data.setSettings((s) => (s ? { ...s, volume: applied } : s));
        })
        .catch(() => {});
    }, 300);
  };
  // Now-playing scrub (owner + mods): push the seek to the overlay's current show.
  const onSeek = (seconds: number) => {
    if (channelId) void seekPlayback(channelId, seconds).catch(() => {});
  };

  // Owner-only moderation settings, edited in a drawer beside the queue instead of a page trip
  // (moderation is the in-stream loop). Mirrors the settings page's save: persist + sync local.
  const saveModSettings = (patch: Partial<ChannelSettings>) =>
    void act(async () => data.setSettings(await saveSettings(channelId!, patch)), {
      success: t('toast.saved'),
    });

  // DJ knobs (owner + mods): persist via the mod-accessible music endpoint (not the owner-only
  // settings PATCH), then sync local state; the server re-emits music:config to the overlay.
  const applyMusicConfig = (cfg: { shuffle?: boolean; volume?: number; hidden?: boolean }) => {
    if (!channelId) return;
    void saveMusicConfig(channelId, cfg)
      .then((r) => data.setMusicConfig({ shuffle: r.shuffle, volume: r.volume, hidden: r.hidden }))
      .catch(() => {});
  };

  // Background-music remote — shown to the owner AND moderators (a mod can run the music).
  const musicCard = channelId ? (
    <MusicPlayerCard
      channelId={channelId}
      tracks={data.musicTracks}
      onTracksChange={data.setMusicTracks}
      loading={data.musicLoading}
      musicState={data.musicState}
      shuffle={data.musicConfig.shuffle}
      onToggleShuffle={(v) => applyMusicConfig({ shuffle: v })}
      hidden={data.musicConfig.hidden}
      onToggleHidden={(v) => applyMusicConfig({ hidden: v })}
      volume={data.musicConfig.volume}
      onVolumeChange={(v) => applyMusicConfig({ volume: v })}
    />
  ) : null;

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

  // Both stages, as two cards: the media one always, the compact player's only while it holds a
  // show. Rendered twice below (mobile column / desktop column), so it lives in one place.
  const nowPlaying = (
    <>
      <NowPlayingCard
        now={data.now}
        progress={data.progress}
        live={data.progress !== null}
        isOwner={isOwner}
        volume={data.contentVolume ?? undefined}
        onVolumeChange={onContentVolume}
        onSeek={onSeek}
        onSkip={() => actions.skip('media')}
        onPauseResume={(paused) => actions.pauseResume(paused, 'media')}
        onOpenTest={() => setTestOpen(true)}
      />
      {data.nowMusic && (
        <NowPlayingCard
          now={data.nowMusic}
          progress={data.musicProgress}
          live={data.musicProgress !== null}
          isOwner={isOwner}
          // Same channel-wide volume as the media card — both sliders move together.
          volume={data.contentVolume ?? undefined}
          onVolumeChange={onContentVolume}
          onSeek={(seconds) =>
            channelId && void seekPlayback(channelId, seconds, 'music').catch(() => {})
          }
          onSkip={() => actions.skip('music')}
          onPauseResume={(paused) => actions.pauseResume(paused, 'music')}
          onOpenTest={() => setTestOpen(true)}
          title={t('dash.nowPlayingMusic')}
        />
      )}
    </>
  );

  return (
    <Content>
      <DashboardTopbar
        list={list}
        current={current}
        channelId={channelId}
        onSelect={setCurrentId}
        accepting={accepting}
        onToggleAccepting={(v) =>
          void act(async () => data.setSettings(await saveSettings(channelId!, { accepting: v })), {
            success: t('toast.saved'),
          })
        }
        isOwner={isOwner}
        presence={data.presence}
        serverConnected={data.serverConnected}
        onReloadOverlay={() =>
          channelId &&
          void act(() => reloadOverlay(channelId), { success: t('toast.overlayReloaded') })
        }
      />

      {/* Mobile: single-column (NowPlaying → queue → members). Desktop (lg+): two-column grid.
          NowPlaying rendered twice for responsive display (mobile lg:hidden, desktop hidden lg:block). */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4 lg:hidden">
          {nowPlaying}
          {channelId && data.queue.length > 0 && (
            <QueueCard channelId={channelId} queue={data.queue} />
          )}
          {musicCard}
        </div>

        <div className="min-w-0">
          <ModerationQueue
            pending={data.pending}
            reputation={data.reputation}
            onApprove={actions.onApprove}
            onTrust={actions.onTrust}
            onReject={actions.onReject}
            onBan={actions.onBan}
            onOpenSettings={isOwner && data.settings ? () => setModSettingsOpen(true) : undefined}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4 self-start lg:sticky lg:top-20">
          <div className="hidden flex-col gap-4 lg:flex">
            {nowPlaying}
            {channelId && data.queue.length > 0 && (
              <QueueCard channelId={channelId} queue={data.queue} />
            )}
            {musicCard}
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
          {/* Team management also lives on Home; moderation workflows expect it here too. */}
          {isOwner && channelId && <TeamCard channelId={channelId} />}
        </div>
      </div>

      {isOwner && (
        <TestSendModal open={testOpen} onClose={() => setTestOpen(false)} login={current.login} />
      )}

      {isOwner && data.settings && (
        <Drawer
          open={modSettingsOpen}
          onClose={() => setModSettingsOpen(false)}
          title={t('dash.modSettings')}
          closeLabel={t('common.close')}
          width="max-w-xl"
        >
          <div className="flex flex-col gap-4">
            <ModerationSettings settings={data.settings} onSave={saveModSettings} />
            <SubmissionLimits settings={data.settings} onSave={saveModSettings} />
          </div>
        </Drawer>
      )}
    </Content>
  );
}
