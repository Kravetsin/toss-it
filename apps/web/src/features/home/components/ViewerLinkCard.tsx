import { Link } from 'react-router-dom';
import { useClipboard } from '@/hooks/useClipboard';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card, CopyableLinkBox } from '@/ui';

/**
 * Permanent home for the streamer's public submissions page: the link they paste every stream —
 * the one thing not in the app nav, and one the guide only teaches before it collapses. Dashboard
 * and settings navigation live in the sidebar, so this card no longer duplicates them; it just owns
 * the viewer link, a preview door, and a quiet shortcut to the page's own settings.
 */
export function ViewerLinkCard({ login, viewerUrl }: { login: string; viewerUrl: string }) {
  const { t } = useI18n();
  const { copiedKey, copy } = useClipboard();
  return (
    <Card>
      <h2 className="mb-1">{t('home.myPage')}</h2>
      <p className="mb-3 text-sm text-muted">{t('home.myPageDesc')}</p>
      <CopyableLinkBox
        value={viewerUrl}
        href={viewerUrl}
        size="sm"
        copied={copiedKey === 'viewer'}
        onCopy={() => copy(viewerUrl, 'viewer')}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link to={`/c/${login}`}>
          <Button variant="primary">
            <Icon name="eye" size={16} />
            {t('home.openPage')}
          </Button>
        </Link>
        <Link
          to="/dashboard/settings/channel"
          className="flex items-center gap-1.5 text-sm text-muted outline-none transition-colors hover:text-accent focus-visible:text-accent"
        >
          <Icon name="settings" size={15} />
          {t('home.viewerPageSettingsBtn')}
        </Link>
      </div>
    </Card>
  );
}
