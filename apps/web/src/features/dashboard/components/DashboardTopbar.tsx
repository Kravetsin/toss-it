import { useNavigate } from 'react-router-dom';
import type { AccessibleChannel, OverlayPresence } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { IconButton } from '@/ui';
import { ChannelSwitcher } from './ChannelSwitcher';
import { OverlayStatus } from './OverlayStatus';

// Sticky topbar: title + channel switcher (left), accepting toggle + settings (right).
// accepting toggle is owner-only, hidden if null. Notification/sound controls live in the app-shell bell.
export function DashboardTopbar({
  list,
  current,
  channelId,
  onSelect,
  accepting,
  onToggleAccepting,
  isOwner,
  presence,
  serverConnected,
  onReloadOverlay,
}: {
  list: AccessibleChannel[];
  current: AccessibleChannel;
  channelId: string | null;
  onSelect: (id: string) => void;
  // null = toggle hidden (owner-only or settings not loaded)
  accepting: boolean | null;
  onToggleAccepting: (v: boolean) => void;
  /** Settings are owner-only, so the gear link hides for moderators. */
  isOwner: boolean;
  presence: OverlayPresence;
  /** Our own link to the server — false means the presence above is unknown, not "offline". */
  serverConnected: boolean;
  onReloadOverlay: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  return (
    <div className="static z-20 mb-6 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur lg:sticky lg:top-0 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="flex items-center gap-2 text-2xl">
          <Icon name="shield" size={22} className="text-accent" />
          {t('dash.title')}
        </h1>
        <ChannelSwitcher list={list} current={current} channelId={channelId} onSelect={onSelect} />
      </div>
      <div className="flex items-center gap-2">
        <OverlayStatus
          presence={presence}
          serverConnected={serverConnected}
          onReload={onReloadOverlay}
        />
        {accepting != null && (
          <label
            className={`flex w-max cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 label-mono ${
              accepting
                ? 'border-ok/30 bg-ok-soft text-ok'
                : 'border-danger/30 bg-danger-soft text-danger'
            }`}
          >
            <input
              type="checkbox"
              checked={accepting}
              onChange={(e) => onToggleAccepting(e.target.checked)}
              className="accent-current"
            />
            {accepting ? t('dash.accepting') : t('dash.acceptingOff')}
          </label>
        )}
        {isOwner && (
          <IconButton
            name="settings"
            label={t('settings.title')}
            variant="ghost"
            onClick={() => navigate('/dashboard/settings')}
          />
        )}
      </div>
    </div>
  );
}
