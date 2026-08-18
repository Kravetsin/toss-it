import { t } from '../strings';
import type { ChatCommand } from './types';

/**
 * `!skip` — take what is on screen off it. The one command that removes instead of adds, so the
 * two callers are told apart: the streamer and their moderators skip with a single command, a
 * viewer casts one vote toward the channel's threshold.
 *
 * Cooldown 0 on purpose. The registry's per-caller silence would eat the vote itself, not just its
 * answer — and a viewer whose vote vanished has no way to tell. Repeat votes and the count line are
 * silenced by the tally instead (see the module's `skip` dep), which knows which of them are noise.
 */
export const skip: ChatCommand = {
  name: 'skip',
  aliases: ['скип', 'скіп'],
  available: (state) => state.skipEnabled,
  cooldownMs: 0,
  async run(ctx, deps) {
    const res = await deps.skip({
      channelId: ctx.channelId,
      twitchId: ctx.twitchId,
      privileged: ctx.privileged,
    });
    switch (res.kind) {
      case 'disabled':
      case 'silent':
        return null;
      case 'nothing':
        return { name: ctx.name, text: t(ctx.locale, 'skipNothing') };
      case 'voted':
        return {
          name: ctx.name,
          text: t(ctx.locale, 'skipVotes', { have: res.have, need: res.need }),
        };
      case 'skipped':
        return { name: ctx.name, text: t(ctx.locale, res.byVote ? 'skipDoneVotes' : 'skipDone') };
    }
  },
};
