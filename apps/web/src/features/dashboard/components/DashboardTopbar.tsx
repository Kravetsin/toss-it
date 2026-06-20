import type { AccessibleChannel } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { IconButton } from '@/ui';
import { StardustWallet } from '@/components/StardustWallet';
import { ChannelSwitcher } from './ChannelSwitcher';

// Sticky topbar: title + channel switcher (left), accepting toggle + sound + history (right).
// accepting toggle is owner-only, hidden if null.
export function DashboardTopbar({
  list,
  current,
  channelId,
  onSelect,
  soundOn,
  onToggleSound,
  accepting,
  onToggleAccepting,
  onOpenHistory,
}: {
  list: AccessibleChannel[];
  current: AccessibleChannel;
  channelId: string | null;
  onSelect: (id: string) => void;
  soundOn: boolean;
  onToggleSound: () => void;
  // null = toggle hidden (owner-only or settings not loaded)
  accepting: boolean | null;
  onToggleAccepting: (v: boolean) => void;
  onOpenHistory: () => void;
}) {
  const { t } = useI18n();
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
        <StardustWallet />
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
        <IconButton
          name={soundOn ? 'bell' : 'bell-off'}
          label={soundOn ? t('dash.notifyOn') : t('dash.notifyOff')}
          variant="ghost"
          active={soundOn}
          onClick={onToggleSound}
        />
        <IconButton
          name="history"
          label={t('dash.history')}
          variant="ghost"
          onClick={onOpenHistory}
        />
      </div>
    </div>
  );
}
