import { useI18n } from '@/i18n';
import { Badge } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';

export type Platform = 'twitch' | 'google';

const PLATFORM_LABEL: Record<Platform, string> = { twitch: 'Twitch', google: 'Google' };

/** Платформа входа зашита в id пользователя: 'twitch:…' / 'google:…' / 'fake:…' (см. server/auth). */
export function platformOf(userId: string | null | undefined): Platform | null {
  if (!userId) return null;
  const sep = userId.indexOf(':');
  const p = sep > 0 ? userId.slice(0, sep) : '';
  return p === 'twitch' || p === 'google' ? p : null;
}

/**
 * Значок-метка: по умолчанию — иконка, по наведению/фокусу выезжает название (моно-капс).
 * Лейбл всегда в DOM (clip через max-width) — доступен скринридерам. Общий компонент для
 * платформы и бейджей-заслуг.
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
      <span className="label-mono max-w-0 overflow-hidden whitespace-nowrap pl-1 transition-[max-width] duration-[var(--dur)] ease-out group-hover/hb:max-w-[7rem] group-focus-visible/hb:max-w-[7rem]">
        {label}
      </span>
    </span>
  );
}

/** Глиф платформы (по id пользователя) с раскрытием названия. Null, если платформа неизвестна. */
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
    <HoverBadge icon={platform} label={PLATFORM_LABEL[platform]} tone="muted" size={size} className={className} />
  );
}

interface BadgeDef {
  key: string;
  icon: IconName;
  label: string;
}

/**
 * Бейджи-заслуги рядом с ником. Сейчас один — Founder; контейнер готов к росту (перенос строк).
 * variant 'icons' — значки с раскрытием названия (плотные списки), 'chips' — текст-чипы (профиль/шапка).
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
  // Будущие бейджи-заслуги добавляются сюда — раскладка уже готова.
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
