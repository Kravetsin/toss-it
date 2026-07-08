import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { rotateOverlayToken, sendTestDonation } from '@/lib/api';
import { OVERLAY_BASE_URL } from '@/lib/config';
import { useApiAction } from '@/hooks/useApiAction';
import { useMe } from '@/hooks/useMe';
import { useConfirm } from '@/providers/ConfirmProvider';
import { useI18n } from '@/i18n';
import { Card, Loader } from '@/ui';
import { OverlayCard } from '@/features/home/components/OverlayCard';
import { useChannels } from '@/features/dashboard/hooks/useChannels';
import { useSettingsData } from '@/features/dashboard/hooks/useSettingsData';
import { OverlaySettings } from '@/features/dashboard/components/OverlaySettings';
import { ModerationSettings } from '@/features/dashboard/components/ModerationSettings';
import { ChatDustSettings } from '@/features/dashboard/components/ChatDustSettings';
import { ChannelPageSettings } from '@/features/dashboard/components/ChannelPageSettings';
import { IntegrationsCard } from '@/features/dashboard/components/IntegrationsCard';

function Content({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">{children}</div>;
}

type Section = 'overlay' | 'moderation' | 'channel' | 'integrations';
const SECTIONS: Section[] = ['overlay', 'moderation', 'channel', 'integrations'];

/** Channel settings page with tabs: Overlay / Channel / Integrations (owner-only). */
export function SettingsPage() {
  const { t } = useI18n();
  const act = useApiAction();
  const confirm = useConfirm();
  const { me, refresh } = useMe();
  const { section: raw } = useParams();
  const section: Section = SECTIONS.includes(raw as Section) ? (raw as Section) : 'overlay';

  const { channelId, isOwner } = useChannels();
  const { settings, loading, save } = useSettingsData(channelId, isOwner);

  // The overlay URLs live here too (same card as Home): the URL and its settings
  // belong on one screen — users look for both where they see the overlay.
  const ownsThisChannel = me?.channel?.id === channelId;
  const overlayUrl = ownsThisChannel
    ? `${OVERLAY_BASE_URL}/?token=${me!.channel!.overlayToken}`
    : null;
  const chatUrl = ownsThisChannel
    ? `${OVERLAY_BASE_URL}/chat.html?token=${me!.channel!.overlayToken}`
    : null;
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

  const onSave = (patch: Parameters<typeof save>[0]) =>
    void act(
      async () => {
        await save(patch);
      },
      { success: t('toast.saved') },
    );

  const tabs: { key: Section; label: string }[] = [
    { key: 'overlay', label: t('settings.overlay') },
    { key: 'moderation', label: t('settings.moderation') },
    { key: 'channel', label: t('settings.channel') },
    { key: 'integrations', label: t('settings.integrations') },
  ];

  return (
    <Content>
      <h1 className="mb-1 flex items-center gap-2 text-2xl">{t('settings.title')}</h1>

      {channelId && isOwner && (
        <div className="mb-6 mt-4 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border">
          {tabs.map((tab) => {
            const active = tab.key === section;
            return (
              <Link
                key={tab.key}
                to={`/dashboard/settings/${tab.key}`}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 label-mono transition-colors ${
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      )}

      {!channelId || !isOwner ? (
        <Card>
          <p className="text-muted">{t('settings.ownerOnly')}</p>
        </Card>
      ) : loading ? (
        <Loader label={t('common.loading')} />
      ) : !settings ? (
        <Card>
          <p className="text-muted">{t('settings.loadError')}</p>
        </Card>
      ) : section === 'overlay' ? (
        <div className="flex flex-col gap-4">
          {overlayUrl && chatUrl && (
            <OverlayCard
              overlayUrl={overlayUrl}
              chatUrl={chatUrl}
              onRotate={rotateToken}
              showSettingsLink={false}
            />
          )}
          <OverlaySettings settings={settings} onSave={onSave} />
        </div>
      ) : section === 'moderation' ? (
        <ModerationSettings settings={settings} onSave={onSave} />
      ) : section === 'channel' ? (
        <ChannelPageSettings settings={settings} onSave={onSave} />
      ) : (
        <div className="flex flex-col gap-4">
          {/* The chat bot sits with the other integrations (it IS one), not under "Channel page". */}
          <ChatDustSettings settings={settings} />
          <IntegrationsCard
            channelId={channelId}
            onTestDonation={() =>
              void act(() => sendTestDonation(channelId), { success: t('toast.donationSent') })
            }
          />
        </div>
      )}
    </Content>
  );
}
