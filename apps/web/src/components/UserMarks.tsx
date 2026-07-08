import { useI18n } from '@/i18n';
import { Badge } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';

export type Platform = 'twitch' | 'google';

const PLATFORM_LABEL: Record<Platform, string> = { twitch: 'Twitch', google: 'Google' };

/** Login platform encoded in user id prefix: 'twitch:' / 'google:' / 'fake:' (see server/auth). */
export function platformOf(userId: string | null | undefined): Platform | null {
  if (!userId) return null;
  const sep = userId.indexOf(':');
  const p = sep > 0 ? userId.slice(0, sep) : '';
  return p === 'twitch' || p === 'google' ? p : null;
}

/**
 * Icon badge; label slides out on hover/focus. Label always in DOM (clipped via max-width)
 * so screen readers can read it. Shared by platform glyph and achievement badges.
 */
export function HoverBadge({
  icon,
  label,
  tone = 'muted',
  size = 14,
  className = '',
}: {
  icon: IconName;
  label: string;
  tone?: 'muted' | 'accent';
  size?: number;
  className?: string;
}) {
  return (
    <span
      tabIndex={0}
      aria-label={label}
      className={`group/hb inline-flex shrink-0 items-center rounded-full outline-none focus-visible:[box-shadow:var(--shadow-focus)] ${
        tone === 'accent' ? 'text-accent' : 'text-muted'
      } ${className}`}
    >
      <Icon name={icon} size={size} />
      {/* Collapsed = truly 0 wide: pl-1 lives behind the hover so its padding doesn't leave a
          residual sliver when max-width is 0 (border-box keeps padding even at max-w-0). */}
      <span className="label-mono max-w-0 overflow-hidden whitespace-nowrap pl-0 transition-[max-width,padding] duration-[var(--dur)] ease-out group-hover/hb:max-w-[7rem] group-hover/hb:pl-1 group-focus-visible/hb:max-w-[7rem] group-focus-visible/hb:pl-1">
        {label}
      </span>
    </span>
  );
}

/** Platform glyph (from user id) with hover-revealed name. Null if platform unknown. */
export function PlatformIcon({
  userId,
  size = 14,
  className = '',
}: {
  userId: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const platform = platformOf(userId);
  if (!platform) return null;
  return (
    <HoverBadge
      icon={platform}
      label={PLATFORM_LABEL[platform]}
      tone="muted"
      size={size}
      className={className}
    />
  );
}

interface BadgeDef {
  key: string;
  icon: IconName;
  label: string;
}

/**
 * Achievement badges next to a nick. variant 'icons' = hover-reveal glyphs (dense lists),
 * 'chips' = text chips (profile/header).
 */
export function UserBadges({
  isFounder = false,
  variant = 'icons',
  className = '',
}: {
  isFounder?: boolean;
  variant?: 'icons' | 'chips';
  className?: string;
}) {
  const { t } = useI18n();
  const badges: BadgeDef[] = [];
  if (isFounder) badges.push({ key: 'founder', icon: 'sparkles', label: t('badge.founder') });
  if (badges.length === 0) return null;

  if (variant === 'chips') {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
        {badges.map((b) => (
          <Badge key={b.key}>
            <Icon name={b.icon} size={12} />
            {b.label}
          </Badge>
        ))}
      </span>
    );
  }

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 ${className}`}>
      {badges.map((b) => (
        <HoverBadge key={b.key} icon={b.icon} label={b.label} tone="accent" />
      ))}
    </span>
  );
}
