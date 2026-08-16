import type { CSSProperties, ReactNode } from 'react';
import { sealEffectClass, sealMarkup } from '@tmw/shared';
import { BrandSeal } from '@/components/BrandSeal';
import { useI18n } from '@/i18n';
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
  glyph,
  label,
  tone = 'muted',
  size = 14,
  focusable = true,
  className = '',
}: {
  icon?: IconName;
  /** Custom mark instead of an icon-set glyph (the founder badge wears the logo itself). */
  glyph?: ReactNode;
  label: string;
  tone?: 'muted' | 'accent';
  size?: number;
  /** Set false inside a button/link: a focus stop nested in a control is a keyboard trap. */
  focusable?: boolean;
  className?: string;
}) {
  return (
    <span
      {...(focusable ? { tabIndex: 0 } : {})}
      aria-label={label}
      className={`group/hb inline-flex shrink-0 items-center rounded-full outline-none focus-visible:[box-shadow:var(--shadow-focus)] ${
        tone === 'accent' ? 'text-accent' : 'text-muted'
      } ${className}`}
    >
      {glyph ?? (icon ? <Icon name={icon} size={size} /> : null)}
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
  /** Rendered at the given px size; a badge may wear an icon-set glyph or a mark of its own. */
  glyph: (size: number) => ReactNode;
  label: string;
}

/** The ONE way to render an equipped seal outside the chat overlay: always immediately before the
 *  nick (after the level numeral), never trailing the badges — a seal is an artifact worn by the
 *  person, not an achievement chip. Sized via inline font-size (the shared .seal-fx scales from it)
 *  rather than a Tailwind class, so a caller can pass any size without a purge-safe literal. A
 *  colourable seal reads its tint from the `--seal-tint` custom property set here. */
export function SealMark({
  seal,
  color,
  size = 24,
  className = '',
}: {
  seal: string | null | undefined;
  /** #rrggbb tint for a colourable seal; omit/null to use the seal's own palette. */
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const cls = sealEffectClass(seal);
  if (!cls) return null;
  const style = { fontSize: size, ...(color ? { '--seal-tint': color } : {}) } as CSSProperties;
  // Inner markup only for the seals that ship it (see SealModule.svg) — a constant from our own
  // registry, never user input, which is what makes injecting it here safe.
  const markup = sealMarkup(seal);
  return (
    <span
      aria-hidden
      style={style}
      className={`shrink-0 ${cls} ${className}`}
      {...(markup ? { dangerouslySetInnerHTML: { __html: markup } } : {})}
    />
  );
}

/**
 * Earned badges next to a nick — ONE rendering everywhere: a bare mark at seal size, name revealed
 * on hover (like the platform glyph). No pill, no always-on caption: a badge is an object the person
 * earned, and a row of framed captions would out-shout the nick and the seal it stands next to.
 * Channel-level badges land in this same row — give them a `glyph`, not a chip.
 */
export function UserBadges({
  isFounder = false,
  size = 24,
  focusable = true,
  className = '',
}: {
  isFounder?: boolean;
  size?: number;
  /** Set false inside a button/link (see HoverBadge). */
  focusable?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const badges: BadgeDef[] = [];
  // Founders wear the logo, not a glyph borrowed from the icon set: they're part of the app itself,
  // and no other mark can say that. Keep it the emblem — don't swap it for an icon later.
  if (isFounder)
    badges.push({
      key: 'founder',
      glyph: (px) => <BrandSeal size={px} decorative />,
      label: t('badge.founder'),
    });
  if (badges.length === 0) return null;

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 ${className}`}>
      {badges.map((b) => (
        <HoverBadge
          key={b.key}
          glyph={b.glyph(size)}
          label={b.label}
          tone="accent"
          focusable={focusable}
        />
      ))}
    </span>
  );
}
