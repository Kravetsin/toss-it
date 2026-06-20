import { useClipboard } from '@/hooks/useClipboard';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card, CopyableLinkBox } from '@/ui';

/** OBS overlay card: URL holds a secret token (masked); supports copy and rotation. */
export function OverlayCard({
  overlayUrl,
  onRotate,
}: {
  overlayUrl: string;
  onRotate: () => void;
}) {
  const { t } = useI18n();
  const { copiedKey, copy } = useClipboard();
  return (
    <Card>
      <h2 className="mb-1">{t('home.overlayTitle')}</h2>
      <p className="mb-3 flex items-start gap-2 text-sm text-muted">
        <Icon name="square-alert" size={16} className="mt-0.5 shrink-0 text-warn" />
        <span>{t('home.overlayDesc')}</span>
      </p>
      <CopyableLinkBox
        value={overlayUrl}
        secret
        size="sm"
        copied={copiedKey === 'overlay'}
        onCopy={() => copy(overlayUrl, 'overlay')}
      />
      <div className="mt-3">
        <Button variant="danger" onClick={onRotate}>
          <Icon name="reload" size={16} />
          {t('home.rotate')}
        </Button>
      </div>
    </Card>
  );
}
