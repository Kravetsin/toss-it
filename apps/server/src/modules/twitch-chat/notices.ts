import type { BotLocale, ChatNotice, ChatNoticeType } from '@tmw/shared';
import { t, type BotStringKey } from './strings';

/** Notice kind -> caption key. Exhaustive by type: a new kind on the wire fails to compile here
 *  instead of silently falling back to Twitch's English line. */
const CAPTION: Record<ChatNoticeType, BotStringKey> = {
  sub: 'noticeSub',
  resub: 'noticeResub',
  subGift: 'noticeSubGift',
  communitySubGift: 'noticeCommunitySubGift',
  giftPaidUpgrade: 'noticeGiftPaidUpgrade',
  primePaidUpgrade: 'noticePrimePaidUpgrade',
  payItForward: 'noticePayItForward',
  raid: 'noticeRaid',
  unraid: 'noticeUnraid',
  announcement: 'noticeAnnouncement',
  bitsBadgeTier: 'noticeBitsBadgeTier',
  charityDonation: 'noticeCharityDonation',
  watchStreak: 'noticeWatchStreak',
  modiversary: 'noticeModiversary',
};

/** Kinds whose count is months rather than a bare tally — those carry a unit. */
const IN_MONTHS = new Set<ChatNoticeType>(['resub', 'modiversary']);

/** Thousands grouping only (a bits tier reads '10 000', not '10000'). */
const NUMBER_LOCALE: Record<BotLocale, string> = { en: 'en-US', ru: 'ru-RU', uk: 'uk-UA' };

/**
 * Our caption for a notice, in the channel's bot locale, in place of Twitch's English line.
 * One shape for every kind — "what · detail" — so a new event never needs a new layout. The detail
 * is the count where there is one (months carry their unit), otherwise the other party's name; the
 * row itself already says who, so the caption never repeats the author.
 */
export function noticeText(notice: ChatNotice, locale: BotLocale): string {
  const what = t(locale, CAPTION[notice.type]);
  // A zero count is no detail at all — fall through to the name rather than printing "· 0".
  const detail = notice.count
    ? IN_MONTHS.has(notice.type)
      ? `${notice.count.toLocaleString(NUMBER_LOCALE[locale])} ${t(locale, 'noticeMonths')}`
      : notice.count.toLocaleString(NUMBER_LOCALE[locale])
    : notice.otherName;
  return detail ? `${what} · ${detail}` : what;
}
