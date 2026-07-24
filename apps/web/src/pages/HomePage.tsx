import { createChannel, rotateOverlayToken } from '@/lib/api';
import { OVERLAY_BASE_URL } from '@/lib/config';
import { useMe } from '@/hooks/useMe';
import { useApiAction } from '@/hooks/useApiAction';
import { useConfirm } from '@/providers/ConfirmProvider';
import { useI18n } from '@/i18n';
import { Loader } from '@/ui';
import { LoggedOutHero } from '@/features/home/components/LoggedOutHero';
import { NoChannelCard } from '@/features/home/components/NoChannelCard';
import { ViewerLinkCard } from '@/features/home/components/ViewerLinkCard';
import { TeamCard } from '@/features/home/components/TeamCard';
import { ChatDustSettings } from '@/features/dashboard/components/ChatDustSettings';
import { SetupGuide } from '@/features/home/components/SetupGuide';
import { ChatUpsellCard } from '@/features/home/components/ChatUpsellCard';
import { useOnboarding } from '@/features/home/hooks/useOnboarding';
import { useSettingsData } from '@/features/dashboard/hooks/useSettingsData';

function Content({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-10">{children}</div>;
}

export function HomePage() {
  const { t, lang } = useI18n();
  const confirm = useConfirm();
  const { me, loading, refresh } = useMe();
  const act = useApiAction();
  // Bot status card needs channel settings; home is always the owner's view.
  const { settings } = useSettingsData(me?.channel?.id ?? null, true);
  // One fetch shared by the setup guide and the chat upsell card.
  const onboarding = useOnboarding(me?.channel?.id ?? null);

  if (loading) {
    return (
      <Content>
        <Loader label={t('common.loading')} />
      </Content>
    );
  }

  if (!me?.user) {
    return (
      <Content>
        <LoggedOutHero />
      </Content>
    );
  }

  const overlayUrl = me.channel ? `${OVERLAY_BASE_URL}/?token=${me.channel.overlayToken}` : null;
  const chatUrl = me.channel
    ? `${OVERLAY_BASE_URL}/chat.html?token=${me.channel.overlayToken}`
    : null;
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
    <Content>
      {!me.channel ? (
        <NoChannelCard
          onCreate={() =>
            // The dashboard's language seeds the bot's — the best guess available for free.
            void act(() => createChannel(lang), {
              after: refresh,
              success: t('toast.channelCreated'),
            })
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <SetupGuide
            status={onboarding}
            overlayUrl={overlayUrl!}
            chatUrl={chatUrl!}
            viewerUrl={viewerUrl}
            viewerLogin={me.user.login}
            hasTwitch={me.user.hasTwitch}
            onRotate={rotateToken}
          />
          <ViewerLinkCard login={me.user.login} viewerUrl={viewerUrl} />
          {settings && <ChatDustSettings settings={settings} />}
          {/* Not-linked owners: chat feature lives here permanently, not in the collapsing guide. */}
          {!me.user.hasTwitch && onboarding?.botLogin && (
            <ChatUpsellCard botLogin={onboarding.botLogin} />
          )}
          <TeamCard channelId={me.channel.id} />
        </div>
      )}
    </Content>
  );
}
