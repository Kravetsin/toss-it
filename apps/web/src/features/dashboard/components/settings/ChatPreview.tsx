import { LEVEL_GLOW_FROM, levelTier, toRoman } from '@tmw/shared';
import { StarMark } from '@/components/StarMark';
import { useI18n } from '@/i18n';

/** Twitch's own broadcaster badge — the very art the overlay renders, so the row stays honest. */
const BROADCASTER_BADGE =
  'https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/2';
/** Broadcaster red, straight from chat.css (--role). */
const ROLE = '255, 77, 77';
const NICK = '#8df0cc';
/** The ranked row's level: high enough to carry the glow (chat.ts lights it from level 6). */
const DEMO_LEVEL = 8;

type RowProps = {
  name: string;
  text: string;
  level: number;
  badge: boolean;
  role: boolean;
};

/**
 * Two chat rows, drawn the way the overlay draws them, over a stand-in for the stream. Values are
 * inlined rather than shared with chat.css: that stylesheet ships inside the OBS bundle and is not
 * loaded here, so this is a deliberate copy — change one and check the other.
 *
 * Two rows rather than one because half of what the settings do only shows in the pair: the gap
 * between them, and a ranked row's edge glow against a plain one.
 */
export function ChatPreview({
  name,
  fontSize,
  bgOpacity,
  compact,
  radius,
  gap,
  showBadges,
  showLevel,
  roleBorders,
}: {
  name: string;
  fontSize: number;
  bgOpacity: number;
  /** Nick on the message's first line instead of a line of its own above it. */
  compact: boolean;
  radius: number;
  /** Hundredths of an em, as stored — chat.css divides the same way. */
  gap: number;
  showBadges: boolean;
  showLevel: boolean;
  roleBorders: boolean;
}) {
  const { t } = useI18n();
  const alpha = bgOpacity / 100;
  const rowGap = `${gap / 100}em`;

  function Row({ name: who, text, level, badge, role }: RowProps) {
    const tier = level ? levelTier(level) : null;
    const glow = tier && level >= LEVEL_GLOW_FROM ? tier.color : null;
    const edge = tier?.color ?? NICK;
    const nameLine = (
      <span
        // Roomy: a block flex row of its own. Compact: an inline-block, so its baseline comes from
        // the nick and not from the badge ahead of it (the bug chat.css calls out).
        className={compact ? 'inline-block' : 'flex items-center'}
        style={{
          gap: compact ? undefined : '0.3em',
          whiteSpace: 'nowrap',
          marginRight: compact ? '0.4em' : undefined,
        }}
      >
        {tier && showLevel && (
          <span
            style={{
              marginRight: compact ? '0.3em' : undefined,
              color: tier.color,
              fontWeight: 700,
              fontSize: '0.8em',
              letterSpacing: '0.04em',
              textShadow: glow ? `0 0 6px ${glow}, 0 1px 2px rgba(0, 0, 0, 0.5)` : undefined,
            }}
          >
            {toRoman(level)}
          </span>
        )}
        {badge && showBadges && (
          <img
            src={BROADCASTER_BADGE}
            alt=""
            // inline-block against Tailwind's preflight, which makes images block-level: as a
            // block the badge took a line of its own instead of riding the name.
            className="inline-block"
            style={{
              width: '1.05em',
              height: '1.05em',
              marginRight: compact ? '0.3em' : undefined,
              borderRadius: 3,
              verticalAlign: 'middle',
              filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.55))',
            }}
          />
        )}
        <span style={{ fontWeight: 700, color: NICK }}>{who}</span>
      </span>
    );
    const tinted = role && roleBorders;
    return (
      <div
        className="relative self-start"
        style={{
          paddingLeft: compact ? 3 : '1.65em',
          paddingBottom: rowGap,
          color: '#ededec',
          lineHeight: 1.4,
        }}
      >
        {compact ? (
          // The rank edge: on the row, so its glow is free to reach past the bubble's clip.
          <span
            className="absolute"
            style={{
              left: 0,
              top: 0,
              bottom: rowGap,
              width: 3,
              borderRadius: `${radius * 0.17}px 0 0 ${radius * 0.17}px`,
              background: edge,
              boxShadow: glow ? `0 0 14px 2px ${glow}` : undefined,
            }}
          />
        ) : (
          <span
            className="absolute"
            style={{
              left: '0.06em',
              top: '0.22em',
              // The star is inline-block, so an inherited line-height would seat it on a baseline
              // and push it below the name it is supposed to be level with.
              lineHeight: 0,
              color: edge,
              filter: glow ? `drop-shadow(0 0 4px ${glow})` : undefined,
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
            padding: '0.28em 0.7em',
            // Compact squares off the left corners: the card meets the edge along a straight seam.
            borderRadius: compact
              ? `0 ${radius}px ${radius}px 0`
              : `${radius * 0.33}px ${radius}px ${radius}px ${radius}px`,
            background: `rgba(13, 17, 17, ${alpha})`,
            backdropFilter: `blur(${alpha * 14}px)`,
            WebkitBackdropFilter: `blur(${alpha * 14}px)`,
            border: `1px solid ${tinted ? `rgba(${ROLE}, 0.62)` : 'rgba(141, 240, 204, 0.14)'}`,
            boxShadow: tinted
              ? `0 8px 22px -12px rgba(0, 0, 0, 0.6), 0 0 14px -3px rgba(${ROLE}, 0.42)`
              : '0 8px 22px -12px rgba(0, 0, 0, 0.6)',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
          }}
        >
          {compact && nameLine}
          {text}
        </div>
      </div>
    );
  }

  return (
    <div>
      <span className="text-sm text-muted">{t('dash.preview')}</span>
      <div
        className="mt-1 flex flex-col justify-end overflow-hidden rounded-sm border border-border"
        style={{
          fontSize: `${fontSize}px`,
          padding: '0.7em 0.7em 0.2em',
          // Stand-in for a stream frame: a lit pool and a warm one, in colors that are pointedly
          // not the app's — the plate has to read as sitting on someone else's picture.
          background:
            'radial-gradient(120% 90% at 18% 12%, #2f5570 0%, transparent 62%), radial-gradient(90% 80% at 88% 85%, #7a5230 0%, transparent 58%), linear-gradient(160deg, #16221f, #202b34)',
        }}
      >
        <Row
          name={t('dash.chatPreviewName')}
          text={t('dash.chatPreviewText')}
          level={DEMO_LEVEL}
          badge={false}
          role={false}
        />
        <Row name={name} text={t('dash.chatPreviewText2')} level={0} badge role />
      </div>
    </div>
  );
}
