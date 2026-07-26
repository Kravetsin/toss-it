import type { OverlayPresence } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { IconButton, Tooltip } from '@/ui';
import { Icon } from '@/ui/icons';

/** One line of the tooltip: which OBS source it is, and whether it is there. */
function SourceLine({ label, on, unknown }: { label: string; on: boolean; unknown: boolean }) {
  const { t } = useI18n();
  return (
    <span className="flex items-center gap-2">
      <span
        className={`size-1.5 shrink-0 rounded-full ${unknown ? 'bg-muted' : on ? 'bg-ok' : 'bg-danger'}`}
      />
      <span className="text-text">{label}</span>
      <span className="ml-auto">
        {unknown ? '—' : on ? t('dash.overlaySourceOn') : t('dash.overlaySourceOff')}
      </span>
    </span>
  );
}

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

  // The chip is a summary; the tooltip is where the two sources are named apart and — when
  // something is wrong — where the streamer is told what to do about it.
  const tip = (
    <span className="flex w-max min-w-[13rem] flex-col gap-1.5">
      <SourceLine
        label={t('dash.overlaySourceMedia')}
        on={presence.media > 0}
        unknown={!serverConnected}
      />
      <SourceLine
        label={t('dash.overlaySourceChat')}
        on={presence.chat > 0}
        unknown={!serverConnected}
      />
      {!serverConnected ? (
        <span className="border-t border-border pt-1.5">{t('dash.overlayNoServerHint')}</span>
      ) : (
        !live && <span className="border-t border-border pt-1.5">{t('dash.overlayDownHint')}</span>
      )}
    </span>
  );

  return (
    <span className="flex items-center gap-1">
      <Tooltip content={tip} align="end">
        <span
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 label-mono ${tone}`}
        >
          <Icon name="monitor" size={14} />
          <span className="hidden sm:inline">{label}</span>
          {live && presence.chat > 0 && (
            <span className="hidden text-faint sm:inline">{t('dash.overlayChatToo')}</span>
          )}
        </span>
      </Tooltip>
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
