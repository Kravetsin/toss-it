import { Link } from 'react-router-dom';
import { useClipboard } from '@/hooks/useClipboard';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card, CopyableLinkBox } from '@/ui';

/** OBS overlay card: URL holds a secret token (masked); supports copy and rotation. */
export function OverlayCard({
  overlayUrl,
  chatUrl,
  onRotate,
}: {
  overlayUrl: string;
  /** Separate chat overlay browser source (same token). */
  chatUrl: string;
  onRotate: () => void;
}) {
  const { t } = useI18n();
  const { copiedKey, copy } = useClipboard();
  return (
    <Card>
      <h2 className="mb-1">{t('home.overlayTitle')}</h2>
      <p className="mb-2 flex items-start gap-2 text-sm text-muted">
        <Icon name="square-alert" size={16} className="mt-0.5 shrink-0 text-warn" />
        <span>{t('home.overlayDesc')}</span>
      </p>
      <p className="mb-3 flex items-start gap-2 text-sm text-muted">
        <Icon name="monitor" size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>{t('home.overlayResTip')}</span>
      </p>
      <CopyableLinkBox
        value={overlayUrl}
        secret
        size="sm"
        copied={copiedKey === 'overlay'}
        onCopy={() => copy(overlayUrl, 'overlay')}
      />

      <p className="mb-2 mt-4 flex items-start gap-2 text-sm text-muted">
        <Icon name="message-circle" size={16} className="mt-0.5 shrink-0 text-accent" />
        <span>{t('home.chatOverlayDesc')}</span>
      </p>
      <CopyableLinkBox
        value={chatUrl}
        secret
        size="sm"
        copied={copiedKey === 'chat'}
        onCopy={() => copy(chatUrl, 'chat')}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link to="/dashboard/settings/overlay">
          <Button variant="secondary">
            <Icon name="settings" size={16} />
            {t('home.overlaySettingsBtn')}
          </Button>
        </Link>
        <Button variant="danger" onClick={onRotate}>
          <Icon name="reload" size={16} />
          {t('home.rotate')}
        </Button>
      </div>
    </Card>
  );
}
