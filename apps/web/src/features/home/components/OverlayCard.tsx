import { useClipboard } from '@/hooks/useClipboard';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card } from '@/ui';

/** Карточка оверлея для OBS: URL с секретным токеном, копирование и перевыпуск токена. */
export function OverlayCard({ overlayUrl, onRotate }: { overlayUrl: string; onRotate: () => void }) {
  const { t } = useI18n();
  const { copiedKey, copy } = useClipboard();
  const copied = copiedKey === 'overlay';
  return (
    <Card>
      <h2 className="mb-1">{t('home.overlayTitle')}</h2>
      <p className="mb-3 flex items-start gap-2 text-sm text-muted">
        <Icon name="square-alert" size={16} className="mt-0.5 shrink-0 text-warn" />
        <span>{t('home.overlayDesc')}</span>
      </p>
      <code className="block break-all rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-text">
        {overlayUrl}
      </code>
      <div className="mt-3 flex gap-2">
        <Button onClick={() => copy(overlayUrl, 'overlay')}>
          <Icon name={copied ? 'check' : 'copy'} size={16} />
          {copied ? t('home.copied') : t('home.copy')}
        </Button>
        <Button variant="danger" onClick={onRotate}>
          <Icon name="reload" size={16} />
          {t('home.rotate')}
        </Button>
      </div>
    </Card>
  );
}
