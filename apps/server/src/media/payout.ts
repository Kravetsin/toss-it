import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from '../db/index';
import { submissionPayouts, submissions } from '../db/schema';
import { roomOf, type RealtimeServer } from '../playback';
import { awardDust } from '../modules/twitch-chat/accrual';

/** What a YouTube request turned out to be worth: it aired, or it never made it to the screen. */
export type SubmissionOutcome = 'aired' | 'failed';

export interface Payouts {
  /**
   * Close the books on a submission. Safe to call more than once — the same submission can reach a
   * terminal state twice (an overlay 'done' racing a late watchdog), and only the first call that
   * claims the row pays out.
   */
  settle(submissionId: string, outcome: SubmissionOutcome): Promise<void>;
}

/**
 * Did we already turn this redemption into a submission? The offline-backlog sweep asks before
 * resubmitting, or every reconnect would replay the requests still waiting their turn.
 */
export async function isRedemptionKnown(redemptionId: string): Promise<boolean> {
  const row = await db
    .select({ id: submissionPayouts.submissionId })
    .from(submissionPayouts)
    .where(eq(submissionPayouts.redemptionId, redemptionId))
    .get();
  return !!row;
}

export interface PayoutDeps {
  io: RealtimeServer;
  log: FastifyBaseLogger;
  /**
   * Hands the verdict to Twitch: FULFILLED takes the points, anything else refunds them. Injected
   * because the channel-points module is optional (a server with no Twitch app never loads it) and
   * because it is built after playback, which is what calls us.
   */
  settleRedemption?: (
    channelId: string,
    rewardId: string,
    redemptionId: string,
    outcome: SubmissionOutcome,
  ) => Promise<void>;
}

export function createPayouts(deps: PayoutDeps): Payouts {
  return {
    async settle(submissionId, outcome) {
      const row = await db
        .select()
        .from(submissionPayouts)
        .where(eq(submissionPayouts.submissionId, submissionId))
        .get();
      if (!row || row.settledAt) return; // web sends, self-sends, and anything already settled
      // Claim it in one statement: two terminal paths can land at once, and whoever loses the race
      // updates nothing and pays nothing.
      const claim = await db
        .update(submissionPayouts)
        .set({ settledAt: new Date() })
        .where(
          and(
            eq(submissionPayouts.submissionId, submissionId),
            isNull(submissionPayouts.settledAt),
          ),
        );
      if (claim.rowsAffected === 0) return;

      if (row.rewardId && row.redemptionId && deps.settleRedemption) {
        await deps
          .settleRedemption(row.channelId, row.rewardId, row.redemptionId, outcome)
          .catch((err) =>
            deps.log.warn({ err, submissionId }, 'payout: settling redemption failed'),
          );
      }

      if (outcome !== 'aired' || row.dust <= 0) {
        deps.log.info(
          { submissionId, channelId: row.channelId, outcome, dust: row.dust },
          'payout: no dust for this request',
        );
        return;
      }
      // Mirrored like a web send, but the two halves are priced apart: the viewer is paid for the
      // points they spent, the streamer for having received the request. Paid to twitch ids, so a
      // viewer with no Tossit account still accrues.
      await awardDust(row.senderPlatformUserId, row.dust);
      if (row.mirrorDust > 0) await awardDust(row.broadcasterId, row.mirrorDust);
      const sub = await db
        .select({ senderName: submissions.senderName })
        .from(submissions)
        .where(eq(submissions.id, submissionId))
        .get();
      deps.io.to(roomOf(row.channelId)).emit('chat:redemption', {
        name: sub?.senderName ?? '',
        dust: row.dust,
      });
      deps.log.info(
        { submissionId, channelId: row.channelId, dust: row.dust, mirrorDust: row.mirrorDust },
        'payout: request aired, dust credited',
      );
    },
  };
}
