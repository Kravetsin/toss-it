import type { BotLocale } from '@tmw/shared';

/**
 * The bot's chat vocabulary. Deliberately tiny and closed: these strings land in someone else's
 * chat mid-stream, so they are answers, not UI copy — short enough to read at a glance, and never
 * a sentence where a number would do. Product UI copy stays in apps/web/src/i18n; this is the one
 * place the SERVER speaks a human language, so it does not belong there.
 */
const STRINGS = {
  en: {
    queuePosition: '{n} of {total}',
    queuePlaying: 'on screen now',
    queueReview: 'in review',
    queueEmpty: 'nothing queued',
    queueUnlinked: 'link your Twitch',
  },
  ru: {
    queuePosition: '{n} из {total}',
    queuePlaying: 'сейчас в эфире',
    queueReview: 'на модерации',
    queueEmpty: 'ничего в очереди',
    queueUnlinked: 'привяжи Twitch',
  },
  uk: {
    queuePosition: '{n} з {total}',
    queuePlaying: 'зараз в ефірі',
    queueReview: 'на модерації',
    queueEmpty: 'нічого в черзі',
    queueUnlinked: "прив'яжи Twitch",
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
