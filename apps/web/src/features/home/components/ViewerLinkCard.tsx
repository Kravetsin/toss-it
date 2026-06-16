import { Link } from 'react-router-dom';
import { useClipboard } from '@/hooks/useClipboard';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card, CopyableLinkBox } from '@/ui';

/** Карточка «Управление»: переходы в дашборд/страницу зрителя + копируемая ссылка зрителя. */
export function ViewerLinkCard({ login, viewerUrl }: { login: string; viewerUrl: string }) {
  const { t } = useI18n();
  const { copiedKey, copy } = useClipboard();
  return (
    <Card>
      <h2 className="mb-3">{t('home.manage')}</h2>
      <div className="flex flex-wrap gap-2">
        <Link to="/dashboard">
          <Button variant="primary">
            <Icon name="shield" size={16} />
            {t('home.dashboardBtn')}
          </Button>
        </Link>
        <Link to={`/c/${login}`}>
          <Button>
            <Icon name="eye" size={16} />
            {t('home.viewerPageBtn')}
          </Button>
        </Link>
      </div>
      <p className="mb-2 mt-4 text-sm text-muted">{t('home.viewerLinkLabel')}</p>
      <CopyableLinkBox
        value={viewerUrl}
        href={viewerUrl}
        size="sm"
        copied={copiedKey === 'viewer'}
        onCopy={() => copy(viewerUrl, 'viewer')}
      />
    </Card>
  );
}
