import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Badge } from '@/ui';

/** Заголовок дашборда: щит + бейдж первопроходца + переключатель звука + ссылка домой. */
export function DashboardHeader({
  isFounder,
  soundOn,
  onToggleSound,
}: {
  isFounder: boolean;
  soundOn: boolean;
  onToggleSound: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="flex items-center gap-2">
        <Icon name="shield" size={26} className="text-twitch-light" />
        {t('dash.title')}
        {isFounder && (
          <Badge>
            <Icon name="sparkles" size={12} />
            {t('badge.founder')}
          </Badge>
        )}
      </h1>
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSound}
          title={soundOn ? t('dash.notifyOn') : t('dash.notifyOff')}
          className="cursor-pointer text-muted hover:text-text"
        >
          <Icon name={soundOn ? 'bell' : 'bell-off'} size={22} />
        </button>
        <Link to="/" className="text-sm text-muted hover:text-text">
          {t('common.home')}
        </Link>
      </div>
    </div>
  );
}
