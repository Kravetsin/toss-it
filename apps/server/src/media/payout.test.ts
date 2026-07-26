import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeIo, makeChannel, makeSubmission, youtubePatch } from '../../test/fakes';
import { db } from '../db/index';
import { pendingDust, submissionPayouts } from '../db/schema';
import { createPayouts, isRedemptionKnown, type SubmissionOutcome } from './payout';

/**
 * What a YouTube request is worth, and when. Every case here is one a viewer can feel: dust that
 * never arrived, points taken for a video that never played, or a double payout.
 */
describe('payouts', () => {
  let channelId: string;
  let viewerId: string;
  let ownerId: string;
  let settled: { redemptionId: string; outcome: SubmissionOutcome }[];
  let payouts: ReturnType<typeof createPayouts>;

  const dustOf = async (platformUserId: string): Promise<number> =>
    (
      await db
        .select()
        .from(pendingDust)
        .where(eq(pendingDust.platformUserId, platformUserId))
        .get()
    )?.amount ?? 0;

  /** A submission with dust owed on it — what submitResolvedYoutube writes when a request arrives. */
  const owe = async (dust: number, mirrorDust: number, redemptionId?: string): Promise<string> => {
    const sub = await makeSubmission(channelId, youtubePatch());
    await db.insert(submissionPayouts).values({
      submissionId: sub.id,
      channelId,
      senderPlatformUserId: viewerId,
      broadcasterId: ownerId,
      dust,
      mirrorDust,
      rewardId: redemptionId ? `rw_${redemptionId}` : null,
      redemptionId: redemptionId ?? null,
      createdAt: new Date(),
      settledAt: null,
    });
    return sub.id;
  };

  beforeEach(async () => {
    channelId = await makeChannel();
    viewerId = `tw_v_${crypto.randomUUID()}`;
    ownerId = `tw_o_${crypto.randomUUID()}`;
    settled = [];
    payouts = createPayouts({
      io: fakeIo().io,
      log: { info: () => {}, warn: () => {} } as never,
      settleRedemption: async (_c, _r, redemptionId, outcome) => {
        settled.push({ redemptionId, outcome });
      },
    });
  });

  it('pays both sides and takes the points when a request airs', async () => {
    const id = await owe(100, 20, 'red_aired');
    await payouts.settle(id, 'aired');

    expect(await dustOf(viewerId)).toBe(100);
    expect(await dustOf(ownerId)).toBe(20);
    expect(settled).toEqual([{ redemptionId: 'red_aired', outcome: 'aired' }]);
  });

  it('pays nobody and refunds the points when it never aired', async () => {
    const id = await owe(100, 20, 'red_failed');
    await payouts.settle(id, 'failed');

    expect(await dustOf(viewerId)).toBe(0);
    expect(await dustOf(ownerId)).toBe(0);
    expect(settled).toEqual([{ redemptionId: 'red_failed', outcome: 'failed' }]);
  });

  it('pays once even if two terminal paths settle the same show', async () => {
    // An overlay 'done' racing a late watchdog is exactly this.
    const id = await owe(50, 10);
    await Promise.all([payouts.settle(id, 'aired'), payouts.settle(id, 'aired')]);

    expect(await dustOf(viewerId)).toBe(50);
    expect(await dustOf(ownerId)).toBe(10);
  });

  it('marks the row settled so the offline sweep can tell it apart', async () => {
    const id = await owe(50, 10, 'red_known');
    await payouts.settle(id, 'aired');

    const row = await db
      .select()
      .from(submissionPayouts)
      .where(eq(submissionPayouts.submissionId, id))
      .get();
    expect(row?.settledAt).not.toBeNull();
    expect(await isRedemptionKnown('red_known')).toBe(true);
    expect(await isRedemptionKnown(`red_never_${crypto.randomUUID()}`)).toBe(false);
  });

  it('still fulfils a reward too cheap to pay any dust', async () => {
    const id = await owe(0, 0, 'red_cheap');
    await payouts.settle(id, 'aired');

    expect(await dustOf(viewerId)).toBe(0);
    expect(settled).toEqual([{ redemptionId: 'red_cheap', outcome: 'aired' }]);
  });

  it('ignores a submission nobody owes anything for (a web send)', async () => {
    const sub = await makeSubmission(channelId);
    await payouts.settle(sub.id, 'aired');

    expect(await dustOf(viewerId)).toBe(0);
    expect(settled).toEqual([]);
  });
});
