import type { SocialPlatform } from '@tmw/shared';
import type { IconName } from '@/ui/icons';

/** Icon for each social platform; 'link' uses globe. */
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

/** Platform labels for aria/ui; brand names not translated. */
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
