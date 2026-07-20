import { and, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '../../../db/index';
import { linkedIdentities, submissions } from '../../../db/schema';
import { t } from './strings';
import type { ChatCommand } from './types';

/**
 * Where the caller's own submission is. This is the only feedback a channel-points sender ever
 * gets: they redeemed from Twitch's own UI and never opened the viewer page, so without this they
 * are blind between sending and airing.
 *
 * Two ways to match them, both by an indexed column: the platform identity carried by the send
 * itself (channel points, works with no Tossit account), or the account a web send is keyed by.
 */
export const queue: ChatCommand = {
  name: 'queue',
  aliases: ['очередь', 'черга'],
  async run(ctx, deps) {
    const identity = await db
      .select({ userId: linkedIdentities.userId })
      .from(linkedIdentities)
      .where(
        and(eq(linkedIdentities.provider, 'twitch'), eq(linkedIdentities.providerId, ctx.twitchId)),
      )
      .get();

    const byPlatform = and(
      eq(submissions.senderPlatform, 'twitch'),
      eq(submissions.senderPlatformUserId, ctx.twitchId),
    );
    const mine: (SQL | undefined)[] = [byPlatform];
    if (identity) mine.push(eq(submissions.senderUserId, identity.userId));

    const row = await db
      .select({ id: submissions.id, status: submissions.status })
      .from(submissions)
      .where(
        and(
          eq(submissions.channelId, ctx.channelId),
          inArray(submissions.status, ['pending', 'approved']),
          or(...mine),
        ),
      )
      // Newest wins: someone who sent twice is asking about the one they just sent.
      .orderBy(desc(submissions.createdAt))
      .get();

    if (!row) {
      // Nothing found can mean two different things, and conflating them would lie to half of
      // them: a Google account with no Twitch attached genuinely has a submission we cannot see.
      const unlinked = !identity;
      return {
        name: ctx.name,
        text: t(ctx.locale, unlinked ? 'queueUnlinked' : 'queueEmpty'),
        hint: unlinked ? 'toss-it.win' : undefined,
      };
    }
    if (row.status === 'pending') return { name: ctx.name, text: t(ctx.locale, 'queueReview') };

    const state = deps.queueState(ctx.channelId, row.id);
    // Approved but in neither slot: the queue only survives in memory, so a server restart loses
    // the order. Saying "in review" would be wrong, so fall back to the honest vaguer answer.
    if (!state) return { name: ctx.name, text: t(ctx.locale, 'queueEmpty') };
    if (state.playing) return { name: ctx.name, text: t(ctx.locale, 'queuePlaying') };
    return {
      name: ctx.name,
      text: t(ctx.locale, 'queuePosition', { n: state.position, total: state.total }),
    };
  },
};
