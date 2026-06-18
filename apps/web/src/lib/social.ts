import type { SocialPlatform } from '@tmw/shared';
import type { IconName } from '@/ui/icons';

/** Иконка для каждой соц-платформы (бренд-глиф или generic globe для 'link'). */
export const PLATFORM_ICON: Record<SocialPlatform, IconName> = {
  twitch: 'twitch',
  youtube: 'youtube',
  x: 'x',
  instagram: 'instagram',
  tiktok: 'tiktok',
  discord: 'discord',
  telegram: 'telegram',
  link: 'globe',
};

/** Человекочитаемое имя платформы (для подписи/aria — бренды не переводим). */
export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
  x: 'X',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  discord: 'Discord',
  telegram: 'Telegram',
  link: 'Website',
};
