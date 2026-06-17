import type { AccessibleChannel } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { IconButton } from '@/ui';
import { ChannelSwitcher } from './ChannelSwitcher';

/**
 * Sticky-топбар кокпита (Фаза 3). Слева — заголовок + переключатель канала;
 * справа — звук и триггеры выезжающих панелей настроек/истории. На < lg не
 * липкий (его место занимает мобильная панель оболочки). См. REDESIGN.md §7.2.
 */
export function DashboardTopbar({
  list,
  current,
  channelId,
  onSelect,
  soundOn,
  onToggleSound,
  showSettings,
  onOpenSettings,
  onOpenHistory,
}: {
  list: AccessibleChannel[];
  current: AccessibleChannel;
  channelId: string | null;
  onSelect: (id: string) => void;
  soundOn: boolean;
  onToggleSound: () => void;
  showSettings: boolean;
  onOpenSettings: () => void;
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
        <IconButton
          name={soundOn ? 'bell' : 'bell-off'}
          label={soundOn ? t('dash.notifyOn') : t('dash.notifyOff')}
          variant="ghost"
          active={soundOn}
          onClick={onToggleSound}
        />
        {showSettings && (
          <IconButton
            name="settings"
            label={t('dash.settings')}
            variant="ghost"
            onClick={onOpenSettings}
          />
        )}
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
