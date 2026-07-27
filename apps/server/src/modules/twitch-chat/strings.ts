import type { BotLocale } from '@tmw/shared';

/**
 * The bot's chat vocabulary. Deliberately tiny and closed: these strings land in someone else's
 * chat mid-stream, so they are answers, not UI copy — short enough to read at a glance, and never
 * a sentence where a number would do. Product UI copy stays in apps/web/src/i18n; this is the one
 * place the SERVER speaks a human language, so it does not belong there.
 */
const STRINGS = {
  en: {
    queueAhead: '{n} ahead of you',
    queueNext: "you're next",
    queueMore: '+{n} more',
    queuePlaying: 'on screen now',
    queueReview: 'in review',
    queueEmpty: 'nothing queued',
    queueUnlinked: 'nothing here — link your Twitch if you sent from the site',
    xpProgress: 'lvl {lvl} · {xp}/{next} XP',
    xpMax: 'lvl {lvl} · {xp} XP · max',
    playUsage: 'paste a YouTube link: !play <link>',
    playWait: 'too fast — wait {n}s',
    playFull: 'the queue is full right now, try later',
    playBad: "couldn't read that link",
    playQueued: 'added to the queue',
    playModeration: 'sent for review',
    // Chat-notice captions. The row already shows WHO, so these only say WHAT — and they name a
    // thing rather than an action, because a Slavic past tense would have to guess the sender's
    // gender. The number, when there is one, is appended by the caller as " · n".
    noticeSub: 'new sub',
    noticeResub: 'sub',
    noticeSubGift: 'gift sub',
    noticeCommunitySubGift: 'gift subs',
    noticeGiftPaidUpgrade: 'gift sub continued',
    noticePrimePaidUpgrade: 'moved off Prime',
    noticePayItForward: 'gift passed on',
    noticeRaid: 'raid',
    noticeUnraid: 'raid called off',
    noticeAnnouncement: 'announcement',
    noticeBitsBadgeTier: 'new bits badge',
    noticeCharityDonation: 'charity donation',
    noticeWatchStreak: 'watch streak',
    noticeModiversary: 'mod anniversary',
    /** Unit for the counts that are months (resub, mod anniversary). */
    noticeMonths: 'mo',
    /** Caption on a newcomer's first line — the one message a streamer should answer. */
    emphasisIntro: 'first message',
  },
  ru: {
    queueAhead: 'перед тобой {n}',
    queueNext: 'ты следующий',
    queueMore: 'ещё {n}',
    queuePlaying: 'сейчас в эфире',
    queueReview: 'на модерации',
    queueEmpty: 'ничего в очереди',
    queueUnlinked: 'ничего не вижу — если отправлял с сайта, привяжи Twitch',
    xpProgress: 'ур. {lvl} · {xp}/{next} XP',
    xpMax: 'ур. {lvl} · {xp} XP · макс',
    playUsage: 'вставь ссылку на YouTube: !play <ссылка>',
    playWait: 'слишком часто — подожди ещё {n}с',
    playFull: 'очередь сейчас переполнена, попробуй позже',
    playBad: 'не смог прочитать ссылку',
    playQueued: 'добавил в очередь',
    playModeration: 'отправил на модерацию',
    noticeSub: 'новая подписка',
    noticeResub: 'подписка',
    noticeSubGift: 'подписка в подарок',
    noticeCommunitySubGift: 'подписки в подарок',
    noticeGiftPaidUpgrade: 'продление подарочной подписки',
    noticePrimePaidUpgrade: 'переход с Prime',
    noticePayItForward: 'подарок дальше по цепочке',
    noticeRaid: 'рейд',
    noticeUnraid: 'рейд отменён',
    noticeAnnouncement: 'объявление',
    noticeBitsBadgeTier: 'новый бейдж битов',
    noticeCharityDonation: 'донат на благотворительность',
    noticeWatchStreak: 'серия просмотров',
    noticeModiversary: 'годовщина модератора',
    noticeMonths: 'мес.',
    emphasisIntro: 'первое сообщение',
  },
  uk: {
    queueAhead: 'перед тобою {n}',
    queueNext: 'ти наступний',
    queueMore: 'ще {n}',
    queuePlaying: 'зараз в ефірі',
    queueReview: 'на модерації',
    queueEmpty: 'нічого в черзі',
    queueUnlinked: "нічого не бачу — якщо надсилав із сайту, прив'яжи Twitch",
    xpProgress: 'рів. {lvl} · {xp}/{next} XP',
    xpMax: 'рів. {lvl} · {xp} XP · макс',
    playUsage: 'встав посилання на YouTube: !play <посилання>',
    playWait: 'занадто часто — почекай ще {n}с',
    playFull: 'черга зараз переповнена, спробуй пізніше',
    playBad: 'не зміг прочитати посилання',
    playQueued: 'додав у чергу',
    playModeration: 'надіслав на модерацію',
    noticeSub: 'нова підписка',
    noticeResub: 'підписка',
    noticeSubGift: 'підписка в подарунок',
    noticeCommunitySubGift: 'підписки в подарунок',
    noticeGiftPaidUpgrade: 'продовження подарункової підписки',
    noticePrimePaidUpgrade: 'перехід з Prime',
    noticePayItForward: 'подарунок далі ланцюжком',
    noticeRaid: 'рейд',
    noticeUnraid: 'рейд скасовано',
    noticeAnnouncement: 'оголошення',
    noticeBitsBadgeTier: 'новий бейдж бітів',
    noticeCharityDonation: 'донат на благодійність',
    noticeWatchStreak: 'серія переглядів',
    noticeModiversary: 'річниця модератора',
    noticeMonths: 'міс.',
    emphasisIntro: 'перше повідомлення',
  },
} as const satisfies Record<BotLocale, Record<string, string>>;

export type BotStringKey = keyof (typeof STRINGS)['en'];

/** Look up a bot string, falling back to English if a locale ever goes missing a key. */
export function t(
  locale: BotLocale,
  key: BotStringKey,
  params?: Record<string, string | number>,
): string {
  const raw: string = STRINGS[locale]?.[key] ?? STRINGS.en[key];
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => String(params[name] ?? whole));
}
