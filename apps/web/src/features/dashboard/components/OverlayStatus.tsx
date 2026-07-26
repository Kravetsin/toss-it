import type { OverlayPresence } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { IconButton } from '@/ui';
import { Icon } from '@/ui/icons';

/**
 * Is the stream's overlay actually there? The streamer used to find out only by sending something
 * and watching nothing happen. Three states, and the third matters: with our own socket down we
 * know nothing about the overlay, and saying "connected" from a stale value would be a lie.
 */
export function OverlayStatus({
  presence,
  serverConnected,
  onReload,
}: {
  presence: OverlayPresence;
  serverConnected: boolean;
  onReload: () => void;
}) {
  const { t } = useI18n();
  const live = serverConnected && presence.media > 0;
  const tone = !serverConnected
    ? 'border-border bg-surface-2 text-muted'
    : live
      ? 'border-ok/30 bg-ok-soft text-ok'
      : 'border-danger/30 bg-danger-soft text-danger';
  const label = !serverConnected
    ? t('dash.overlayNoServer')
    : live
      ? t('dash.overlayLive')
      : t('dash.overlayDown');

  return (
    <span className="flex items-center gap-1">
      <span
        className={`flex items-center gap-2 rounded-full border px-3 py-1.5 label-mono ${tone}`}
        title={live || !serverConnected ? undefined : t('dash.overlayDownHint')}
      >
        <Icon name="monitor" size={14} />
        <span className="hidden sm:inline">{label}</span>
        {live && presence.chat > 0 && (
          <span className="hidden text-faint sm:inline">{t('dash.overlayChatToo')}</span>
        )}
      </span>
      <IconButton
        name="reload"
        label={t('dash.overlayReload')}
        tooltip={t('dash.overlayReload')}
        variant="ghost"
        disabled={!serverConnected || presence.media + presence.chat === 0}
        onClick={onReload}
      />
    </span>
  );
}
