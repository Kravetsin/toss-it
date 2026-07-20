import { readDust } from '../accrual';
import type { ChatCommand } from './types';

/**
 * The caller's stardust. Answer stays language-neutral (name + star + number) like the redemption
 * line. Unclaimed dust carries the domain underneath — a chatter who has never logged in seeing a
 * balance already waiting for them is the whole point of putting this command first.
 */
export const balance: ChatCommand = {
  name: 'balance',
  aliases: ['dust'],
  async run(ctx) {
    const { dust, claimed } = await readDust(ctx.twitchId);
    return { name: ctx.name, dust, hint: claimed ? undefined : 'toss-it.win' };
  },
};
