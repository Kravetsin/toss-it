import { and, eq, inArray, or, type SQL } from 'drizzle-orm';
import { db } from '../../../db/index';
import { linkedIdentities, submissions } from '../../../db/schema';
import { t } from './strings';
import type { ChatCommand } from './types';

/**
 * How long until the caller's own content airs. This is the only feedback a channel-points sender
 * ever gets: they redeemed from Twitch's own UI and never opened the viewer page, so without this
 * they are blind between sending and airing.
 *
 * Answers about their SOONEST post, not their newest: "when is my stuff on?" is a question about
 * what plays first. Extra posts are reported as a count rather than a list — a chat line is not a
 * place to enumerate, and the next one is the only one with a meaningful wait attached.
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

    const mine: (SQL | undefined)[] = [
      and(
        eq(submissions.senderPlatform, 'twitch'),
        eq(submissions.senderPlatformUserId, ctx.twitchId),
      ),
    ];
    if (identity) mine.push(eq(submissions.senderUserId, identity.userId));

    // Bounded by the queue, not by history: only what is still waiting or in moderation.
    const rows = await db
      .select({ id: submissions.id, status: submissions.status })
      .from(submissions)
      .where(
        and(
          eq(submissions.channelId, ctx.channelId),
          inArray(submissions.status, ['pending', 'approved']),
          or(...mine),
        ),
      )
      .all();

    if (rows.length === 0) {
      // Nothing found means two different things, and conflating them would lie to half of them:
      // a Google account with no Twitch attached genuinely has posts we cannot see.
      const unlinked = !identity;
      return {
        name: ctx.name,
        text: t(ctx.locale, unlinked ? 'queueUnlinked' : 'queueEmpty'),
        hint: unlinked ? 'toss-it.org' : undefined,
      };
    }

    // Approved rows missing from the in-memory queue are treated as gone rather than guessed at:
    // the order only lives in server memory, so a restart legitimately loses them.
    const live = rows
      .filter((r) => r.status === 'approved')
      .map((r) => deps.queueState(ctx.channelId, r.id))
      .filter((s) => s !== null);
    const waiting = live
      .filter((s) => !s.playing)
      .map((s) => s.position)
      .sort((a, b) => a - b);

    const parts: string[] = [];
    if (live.some((s) => s.playing)) {
      parts.push(t(ctx.locale, 'queuePlaying'));
      if (waiting.length > 0) parts.push(t(ctx.locale, 'queueMore', { n: waiting.length }));
    } else if (waiting.length > 0) {
      const ahead = waiting[0]! - 1;
      parts.push(
        ahead === 0 ? t(ctx.locale, 'queueNext') : t(ctx.locale, 'queueAhead', { n: ahead }),
      );
      if (waiting.length > 1) parts.push(t(ctx.locale, 'queueMore', { n: waiting.length - 1 }));
    } else if (rows.some((r) => r.status === 'pending')) {
      parts.push(t(ctx.locale, 'queueReview'));
    } else {
      parts.push(t(ctx.locale, 'queueEmpty'));
    }
    return { name: ctx.name, text: parts.join(' · ') };
  },
};
