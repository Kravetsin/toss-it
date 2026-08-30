import { GIFT } from '@tmw/shared';
import { t } from '../strings';
import type { ChatCommand } from './types';

/**
 * `!gift <nick> <amount>` — hand someone your stardust.
 *
 * No channel switch, unlike `!play`, `!tts` and `!bet`: those queue something on the streamer's
 * behalf, put words on their screen, or run a betting game in their chat. This does none of that —
 * it moves dust between two viewers and touches nothing of the streamer's.
 *
 * The recipient does not need an account. An unknown twitch id accumulates in pending dust exactly
 * as chat earnings do, so a gift to a stranger doubles as an invitation — and the answer says so.
 */
export const gift: ChatCommand = {
  name: 'gift',
  aliases: ['подарить', 'подарувати'],
  async run(ctx, deps) {
    const [a, b] = ctx.args;
    if (!a || !b) return { name: ctx.name, text: t(ctx.locale, 'giftUsage') };

    // Either order, like `!bet`: a number is a number and everything else is a name.
    const asNumber = (v: string) => (/^\d+$/.test(v) ? Number.parseInt(v, 10) : null);
    const amount = asNumber(a) ?? asNumber(b);
    const login = asNumber(a) === null ? a : asNumber(b) === null ? b : null;
    if (amount === null || !login) return { name: ctx.name, text: t(ctx.locale, 'giftUsage') };

    const res = await deps.gift({
      channelId: ctx.channelId,
      twitchId: ctx.twitchId,
      login,
      amount,
    });
    switch (res.kind) {
      case 'tooSmall':
        return { name: ctx.name, text: t(ctx.locale, 'giftMin', { n: GIFT.min }) };
      case 'unknown':
        return { name: ctx.name, text: t(ctx.locale, 'giftUnknown', { who: login }) };
      case 'self':
        return { name: ctx.name, text: t(ctx.locale, 'giftSelf') };
      case 'noAccount':
        // The giver has no Tossit account, so there is no balance to give from.
        return { name: ctx.name, text: t(ctx.locale, 'giftNoAccount'), hint: 'toss-it.org' };
      case 'noFunds':
        return { name: ctx.name, text: t(ctx.locale, 'giftNoFunds'), dust: res.balance };
      case 'done':
        // Signed, because this is a change and not a balance — and negative, because it is the
        // giver being answered. What the recipient got is the same number the other way round.
        return {
          name: ctx.name,
          text: t(ctx.locale, 'giftDone', { who: res.toLogin }),
          dust: -res.amount,
          signed: true,
        };
    }
  },
};
