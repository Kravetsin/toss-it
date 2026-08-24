import { StarMark } from '@/components/StarMark';
import { useI18n } from '@/i18n';

/** Twitch's own broadcaster badge — the very art the overlay renders, so the row stays honest. */
const BROADCASTER_BADGE =
  'https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/2';
/** Broadcaster red, straight from chat.css (--role). */
const ROLE = '255, 77, 77';

/**
 * One chat row, drawn the way the overlay draws it, over a stand-in for the stream. Values are
 * inlined rather than shared with chat.css: that stylesheet ships inside the OBS bundle and is not
 * loaded here, so this is a deliberate copy — change one and check the other.
 *
 * The backdrop slider only means anything against a picture; on a flat dark card the streamer would
 * be dialing something invisible.
 */
export function ChatPreview({
  name,
  fontSize,
  bgOpacity,
  compact,
  showBadges,
  roleBorders,
}: {
  name: string;
  fontSize: number;
  bgOpacity: number;
  /** Nick on the message's first line instead of a line of its own above it. */
  compact: boolean;
  showBadges: boolean;
  roleBorders: boolean;
}) {
  const { t } = useI18n();
  const alpha = bgOpacity / 100;
  // The name line is the same content in both layouts — only where it lands changes.
  const nameLine = (
    <span
      className="inline-flex items-center"
      style={{ gap: '0.26em', whiteSpace: 'nowrap', marginRight: compact ? '0.4em' : undefined }}
    >
      {showBadges && (
        <img
          src={BROADCASTER_BADGE}
          alt=""
          style={{
            width: '1.05em',
            height: '1.05em',
            borderRadius: 3,
            filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55))',
          }}
        />
      )}
      <span style={{ fontWeight: 700, color: '#8df0cc' }}>{name}</span>
    </span>
  );
  return (
    <div>
      <span className="text-sm text-muted">{t('dash.preview')}</span>
      <div
        className="mt-1 flex flex-col justify-end overflow-hidden rounded-sm border border-border"
        style={{
          fontSize: `${fontSize}px`,
          // Grows with the font so a 40px row still has its name line and bubble in frame.
          minHeight: `${fontSize * 4.6}px`,
          padding: '0.7em',
          // Stand-in for a stream frame: a lit pool and a warm one, in colors that are pointedly
          // not the app's — the plate has to read as sitting on someone else's picture.
          background:
            'radial-gradient(120% 90% at 18% 12%, #2f5570 0%, transparent 62%), radial-gradient(90% 80% at 88% 85%, #7a5230 0%, transparent 58%), linear-gradient(160deg, #16221f, #202b34)',
        }}
      >
        <div
          className="relative self-start"
          style={{ paddingLeft: compact ? 0 : '1.65em', color: '#ededec', lineHeight: 1.4 }}
        >
          {/* Compact drops the marker and the thread with it — the rank moves to the left edge. */}
          {!compact && (
            <span
              className="absolute"
              style={{
                left: '0.06em',
                top: '0.22em',
                color: '#8df0cc',
                filter: 'drop-shadow(0 0 4px rgba(141, 240, 204, 0.6))',
              }}
            >
              <StarMark size={fontSize * 0.95} />
            </span>
          )}
          {!compact && <div style={{ marginBottom: '0.28em' }}>{nameLine}</div>}
          <div
            style={{
              display: 'inline-block',
              maxWidth: '100%',
              padding: compact ? '0.28em 0.7em 0.28em 0.85em' : '0.28em 0.7em',
              borderRadius: compact ? '2px 12px 12px 2px' : '4px 12px 12px 12px',
              background: `rgba(13, 17, 17, ${alpha})`,
              // The rank edge, the compact layout's stand-in for the star (mint here: the preview
              // row has no level of its own).
              backgroundImage: compact
                ? 'linear-gradient(to right, #8df0cc 0 3px, transparent 3px)'
                : undefined,
              backdropFilter: `blur(${alpha * 14}px)`,
              WebkitBackdropFilter: `blur(${alpha * 14}px)`,
              border: `1px solid ${roleBorders ? `rgba(${ROLE}, 0.62)` : 'rgba(141, 240, 204, 0.14)'}`,
              boxShadow: roleBorders
                ? `0 8px 22px -12px rgba(0, 0, 0, 0.6), 0 0 14px -3px rgba(${ROLE}, 0.42)`
                : '0 8px 22px -12px rgba(0, 0, 0, 0.6)',
              textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
            }}
          >
            {compact && nameLine}
            {t('dash.chatPreviewText')}
          </div>
        </div>
      </div>
    </div>
  );
}
