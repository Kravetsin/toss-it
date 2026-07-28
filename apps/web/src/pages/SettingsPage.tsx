import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { rotateOverlayToken } from '@/lib/api';
// sendTestDonation — re-add when the donations (Donatello) block below is re-enabled.
import { OVERLAY_BASE_URL } from '@/lib/config';
import { useApiAction } from '@/hooks/useApiAction';
import { useMe } from '@/hooks/useMe';
import { useConfirm } from '@/providers/ConfirmProvider';
import { useI18n } from '@/i18n';
import { Accordion, Card, Loader } from '@/ui';
import { OverlayCard } from '@/features/home/components/OverlayCard';
import { useChannels } from '@/features/dashboard/hooks/useChannels';
import { useSettingsData } from '@/features/dashboard/hooks/useSettingsData';
import { ModerationSettings } from '@/features/dashboard/components/ModerationSettings';
import { SubmissionLimits } from '@/features/dashboard/components/SubmissionLimits';
import { ChatDustSettings } from '@/features/dashboard/components/ChatDustSettings';
import { BotCommandsCard } from '@/features/dashboard/components/BotCommandsCard';
import { ChatUpsellCard } from '@/features/home/components/ChatUpsellCard';
import { useOnboarding } from '@/features/home/hooks/useOnboarding';
import { ChannelPageSettings } from '@/features/dashboard/components/ChannelPageSettings';
import { ChannelThemeSettings } from '@/features/dashboard/components/ChannelThemeSettings';
// Donations (Donatello) integration is temporarily disabled (unfinished) — re-enable the import
// and the block in the integrations section when ready.
// import { IntegrationsCard } from '@/features/dashboard/components/IntegrationsCard';
import { ChannelPointsCard } from '@/features/dashboard/components/ChannelPointsCard';
import { SettingsToggles } from '@/features/dashboard/components/settings/SettingsToggles';
import { OverlayTestCard } from '@/features/dashboard/components/settings/OverlayTestCard';
import {
  ChatSettings,
  MediaLayoutSettings,
  MusicSettings,
} from '@/features/dashboard/components/settings/overlaySections';

function Content({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-4xl px-4 py-6 lg:px-8">{children}</div>;
}

type Section = 'overlay' | 'moderation' | 'channel' | 'bot' | 'integrations';
const SECTIONS: Section[] = ['overlay', 'moderation', 'channel', 'bot', 'integrations'];

/**
 * Channel settings (owner-only), split into tabs so each concern is its own screen rather than
 * one long sheet. The Overlay tab groups its many controls into accordions with quick toggles on top.
 */
export function SettingsPage() {
  const { t } = useI18n();
  const act = useApiAction();
  const confirm = useConfirm();
  const { me, refresh } = useMe();
  const { section: raw } = useParams();
  const section: Section = SECTIONS.includes(raw as Section) ? (raw as Section) : 'overlay';

  const { channelId, current, isOwner } = useChannels();
  const { settings, loading, save } = useSettingsData(channelId, isOwner);
  // Only the Bot tab's empty state needs this (it carries the bot's public name for the /mod line),
  // so it is fetched only while that tab is open rather than on every settings visit.
  const onboarding = useOnboarding(section === 'bot' && isOwner ? channelId : null);

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
    { key: 'bot', label: t('settings.bot') },
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
        // First tab redesigned: OBS card + quick toggles stay open; the rest are accordions.
        <div className="flex flex-col gap-4">
          {overlayUrl && chatUrl && (
            <OverlayCard
              overlayUrl={overlayUrl}
              chatUrl={chatUrl}
              onRotate={rotateToken}
              showSettingsLink={false}
            />
          )}
          <SettingsToggles settings={settings} onSave={onSave} />
          {current && <OverlayTestCard login={current.login} channelId={channelId} />}
          <Accordion title={t('settings.mediaLayout')} icon="image">
            <MediaLayoutSettings settings={settings} onSave={onSave} />
          </Accordion>
          <Accordion title={t('settings.music')} icon="volume-2">
            <MusicSettings settings={settings} onSave={onSave} />
          </Accordion>
          <Accordion title={t('settings.chat')} icon="message-circle">
            <ChatSettings settings={settings} onSave={onSave} channelId={channelId} />
          </Accordion>
        </div>
      ) : section === 'moderation' ? (
        <div className="flex flex-col gap-4">
          <ModerationSettings settings={settings} onSave={onSave} />
          <SubmissionLimits settings={settings} onSave={onSave} />
        </div>
      ) : section === 'channel' ? (
        <div className="flex flex-col gap-4">
          <ChannelThemeSettings settings={settings} onSave={onSave} />
          <ChannelPageSettings settings={settings} onSave={onSave} />
        </div>
      ) : section === 'bot' ? (
        <div className="flex flex-col gap-4">
          {/* The bot is its own object — an account living in someone's chat, with its own language
              and its own command set. It is not an integration with an outside service, which is
              what the tab next door is for. */}
          {settings.chatBotLogin ? (
            <>
              <ChatDustSettings settings={settings} onSave={onSave} />
              {/* Right under the bot's own toggles: the list answers "what did I just switch on". */}
              <BotCommandsCard commands={settings.chatCommands} />
            </>
          ) : onboarding === null ? null : onboarding.botLogin ? (
            // No bot HERE because the owner never linked Twitch. The same card the home page uses,
            // so both doors offer the same two actions — a dead-end explanation would leave the
            // streamer reading what is wrong with no way to fix it.
            <ChatUpsellCard botLogin={onboarding.botLogin} />
          ) : (
            // No bot ANYWHERE: the service itself is down, and there is nothing to /mod yet.
            <Card>
              <p className="text-muted">{t('guide.chat.unavailable')}</p>
            </Card>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Donations (Donatello) temporarily disabled — unfinished. Re-enable this block plus the
              IntegrationsCard + sendTestDonation imports when ready.
          <IntegrationsCard
            channelId={channelId}
            onTestDonation={() =>
              void act(() => sendTestDonation(channelId), { success: t('toast.donationSent') })
            }
          /> */}
          <ChannelPointsCard />
        </div>
      )}
    </Content>
  );
}
