import { WELCOME_DUST } from '@tmw/shared';
import { readDust } from '../accrual';
import { t } from '../strings';
import type { ChatCommand } from './types';

/**
 * The caller's stardust. For an account it is a bare number (name + star + value, like the
 * redemption line); for a chatter who has never logged in it becomes what a first login would put
 * in their hands — the dust the bot held for them PLUS the welcome bonus — with the domain
 * underneath. A chatter seeing a balance already waiting for them is the whole point of putting
 * this command first, and the bonus is most of that number for everyone but the heaviest lurkers.
 *
 * Known edge, accepted: a Tossit account made with Google, chatting from an unlinked Twitch, reads
 * as "no account here" and is quoted the bonus it already collected. Unknowable from a Twitch id
 * alone, and it costs that person nothing — they simply get 1000 less than the line implied.
 */
export const balance: ChatCommand = {
  name: 'balance',
  aliases: ['dust'],
  async run(ctx) {
    const { dust, claimed } = await readDust(ctx.twitchId);
    if (claimed) return { name: ctx.name, dust };
    return {
      name: ctx.name,
      text: t(ctx.locale, 'balanceWaiting'),
      dust: dust + WELCOME_DUST,
      hint: 'toss-it.org',
    };
  },
};
