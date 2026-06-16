import { createChannel, logout, rotateOverlayToken } from '@/lib/api';
import { OVERLAY_BASE_URL } from '@/lib/config';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useConfirm } from '@/providers/ConfirmProvider';
import { useI18n } from '@/i18n';
import { Loader, PageShell } from '@/ui';
import { LoggedOutHero } from '@/features/home/components/LoggedOutHero';
import { AccountHeader } from '@/features/home/components/AccountHeader';
import { NoChannelCard } from '@/features/home/components/NoChannelCard';
import { ViewerLinkCard } from '@/features/home/components/ViewerLinkCard';
import { OverlayCard } from '@/features/home/components/OverlayCard';
import { TeamCard } from '@/features/home/components/TeamCard';

export function HomePage() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const { me, loading, refresh } = useMe();
  const act = useApiAction();

  if (loading) {
    return (
      <PageShell maxWidth="2xl">
        <Loader label={t('common.loading')} />
      </PageShell>
    );
  }

  if (!me?.user) {
    return (
      <PageShell maxWidth="2xl">
        <LoggedOutHero />
      </PageShell>
    );
  }

  const overlayUrl = me.channel ? `${OVERLAY_BASE_URL}/?token=${me.channel.overlayToken}` : null;
  const viewerUrl = `${window.location.origin}/c/${me.user.login}`;

  const rotateToken = () =>
    void (async () => {
      if (
        await confirm({
          message: t('home.rotateConfirm'),
          confirmLabel: t('home.rotate'),
          danger: true,
        })
      ) {
        void act(rotateOverlayToken, { after: refresh, success: t('toast.tokenReissued') });
      }
    })();

  return (
    <PageShell maxWidth="2xl">
      <AccountHeader user={me.user} onLogout={() => void act(logout, { after: refresh })} />

      {!me.channel ? (
        <NoChannelCard
          onCreate={() =>
            void act(createChannel, { after: refresh, success: t('toast.channelCreated') })
          }
        />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <ViewerLinkCard login={me.user.login} viewerUrl={viewerUrl} />
          <OverlayCard overlayUrl={overlayUrl!} onRotate={rotateToken} />
          <TeamCard channelId={me.channel.id} />
        </div>
      )}
    </PageShell>
  );
}
