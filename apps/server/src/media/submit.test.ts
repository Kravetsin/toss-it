import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { CHANNEL_POINTS, CHAT_TEXT_MAX_LEN } from '@tmw/shared';
import { fakeIo, makeChannel, makeSubmission } from '../../test/fakes';
import { config } from '../config';
import { db } from '../db/index';
import {
  linkedIdentities,
  submissionPayouts,
  submissions,
  users,
  whitelist,
  type SubmissionRow,
} from '../db/schema';
import { PlaybackManager } from '../playback';
import { parseYoutube } from './youtube';
import {
  acceptsSends,
  dropsCaption,
  hourlyBucketFull,
  submitChatText,
  submitResolvedYoutube,
} from './submit';

/**
 * The caption rule decides what a viewer's own words are allowed to do, so each case here is one a
 * streamer would notice: words on screen they never read, or a bypass that stopped bypassing.
 */
describe('dropsCaption', () => {
  const send = (patch: Partial<Parameters<typeof dropsCaption>[0]> = {}) =>
    dropsCaption({
      autoApproved: true,
      trusted: false,
      autoApproveText: false,
      textOnly: false,
      ...patch,
    });

  it('drops a caption riding along with an instantly-approved GIF or link', () => {
    expect(send()).toBe(true);
  });

  it('keeps it once the streamer opted into viewer text', () => {
    expect(send({ autoApproveText: true })).toBe(false);
  });

  it('keeps it on the way to moderation — the streamer reads it there', () => {
    expect(send({ autoApproved: false })).toBe(false);
  });

  it('keeps it from a sender the streamer already vouched for', () => {
    expect(send({ trusted: true })).toBe(false);
  });

  // Otherwise a text send auto-approved by some future bypass would air as an empty card.
  it('never empties a send that is nothing but text', () => {
    expect(send({ textOnly: true })).toBe(false);
  });
});

let channelId: string;
let broadcasterId: string;
let deps: { playback: PlaybackManager; io: ReturnType<typeof fakeIo>['io'] };

/** A chatter with a linked Tossit account — the only kind the whitelist can name. */
const makeViewer = async (): Promise<{ twitchId: string; userId: string }> => {
  const userId = `u_${crypto.randomUUID()}`;
  const twitchId = `tw_${crypto.randomUUID()}`;
  await db
    .insert(users)
    .values({ id: userId, login: userId, displayName: userId, createdAt: new Date() });
  await db
    .insert(linkedIdentities)
    .values({ provider: 'twitch', providerId: twitchId, userId, createdAt: new Date() });
  return { twitchId, userId };
};

/**
 * The pause switch, which every door has to honour — the website always did, chat and channel
 * points learned to only after a viewer could refill a queue the streamer had just stopped.
 */
describe('acceptsSends', () => {
  it('takes sends while the channel is open', async () => {
    const id = await makeChannel();
    expect(await acceptsSends(id, 'tw_owner', 'tw_viewer')).toBe(true);
  });

  it('turns viewers away once the streamer paused', async () => {
    const id = await makeChannel({ accepting: false });
    expect(await acceptsSends(id, 'tw_owner', 'tw_viewer')).toBe(false);
  });

  it('still lets the broadcaster through — the switch is aimed at viewers', async () => {
    const id = await makeChannel({ accepting: false });
    expect(await acceptsSends(id, 'tw_owner', 'tw_owner')).toBe(true);
  });
});

/**
 * The hourly ceiling, counted per bucket. Text is the cheap door (`!tts`, a line on a card), so a
 * busy hour of it must not close the channel to files and links — nor the other way round.
 */
describe('hourlyBucketFull', () => {
  const fill = async (id: string, n: number, patch: Partial<SubmissionRow>): Promise<void> => {
    for (let i = 0; i < n; i++) await makeSubmission(id, patch);
  };
  const textRow: Partial<SubmissionRow> = { kind: 'text', mime: 'text/plain', filePath: null };

  it('leaves the text budget untouched when the media one is spent', async () => {
    const id = await makeChannel();
    await fill(id, config.moderation.channelHourlyLimit, {});
    expect(await hourlyBucketFull(id, 'image')).toBe(true);
    expect(await hourlyBucketFull(id, 'text')).toBe(false);
  });

  it('closes text only on its own, much larger budget', async () => {
    const id = await makeChannel();
    await fill(id, config.moderation.channelHourlyLimit, textRow);
    expect(await hourlyBucketFull(id, 'text')).toBe(false);
    await fill(
      id,
      config.moderation.channelHourlyLimitText - config.moderation.channelHourlyLimit,
      {
        ...textRow,
      },
    );
    expect(await hourlyBucketFull(id, 'text')).toBe(true);
    expect(await hourlyBucketFull(id, 'image')).toBe(false);
  });

  // The dashboard's "test send" button would otherwise spend the viewers' budget for them.
  it("ignores the owner's own test sends", async () => {
    const id = await makeChannel();
    await fill(id, config.moderation.channelHourlyLimit, { isSelfSend: true });
    expect(await hourlyBucketFull(id, 'image')).toBe(false);
  });

  // An hour is a sliding window, so yesterday's flood must not still be holding the door shut.
  it('forgets sends older than the hour', async () => {
    const id = await makeChannel();
    const old = new Date(Date.now() - 3_700_000);
    await fill(id, config.moderation.channelHourlyLimit, { createdAt: old });
    expect(await hourlyBucketFull(id, 'image')).toBe(false);
  });
});

/**
 * A request that arrives from chat (`!play`) or a channel-points redemption. The streamer's
 * whitelist has to mean the same thing here as on the site — otherwise trusting someone quietly
 * stops working the moment they order from chat instead of the page.
 */
describe('submitResolvedYoutube', () => {
  const resolved = (caption: string) => ({
    parsed: parseYoutube(`https://youtu.be/dQw4w9WgXcQ ${caption}`)!,
    meta: { title: 'The video own title' },
  });

  const request = async (twitchId: string, caption: string) => {
    const { submissionId, autoApproved } = await submitResolvedYoutube(deps, {
      channelId,
      broadcasterId,
      resolved: resolved(caption),
      senderTwitchId: twitchId,
      senderName: 'viewer',
    });
    const row = await db.select().from(submissions).where(eq(submissions.id, submissionId)).get();
    return { autoApproved, text: row?.text ?? null };
  };

  beforeEach(async () => {
    // Auto-approve off on purpose: what airs here must come from the whitelist, nothing else.
    channelId = await makeChannel({ autoApproveYoutubeMusic: false });
    broadcasterId = `tw_b_${crypto.randomUUID()}`;
    const io = fakeIo().io;
    deps = { playback: new PlaybackManager(io), io };
  });

  it('sends a stranger to moderation with their caption intact', async () => {
    const { twitchId } = await makeViewer();
    expect(await request(twitchId, 'look at this')).toEqual({
      autoApproved: false,
      text: 'look at this',
    });
  });

  // Same hole as the paid line: the streamer's own request has to be settleable, or it comes back
  // from the Twitch backlog on every restart.
  it('owes a paid self-send too, at zero dust', async () => {
    const { submissionId } = await submitResolvedYoutube(deps, {
      channelId,
      broadcasterId,
      resolved: resolved(''),
      senderTwitchId: broadcasterId,
      senderName: 'streamer',
      redemption: { rewardId: 'rw_1', redemptionId: 'rd_self_yt', cost: 1000 },
    });
    const payout = await db
      .select()
      .from(submissionPayouts)
      .where(eq(submissionPayouts.submissionId, submissionId))
      .get();
    expect(payout).toMatchObject({ redemptionId: 'rd_self_yt', dust: 0, mirrorDust: 0 });
  });

  it('airs a whitelisted viewer at once, caption and all', async () => {
    const { twitchId, userId } = await makeViewer();
    await db.insert(whitelist).values({ channelId, userId, createdAt: new Date() });
    expect(await request(twitchId, 'look at this')).toEqual({
      autoApproved: true,
      text: 'look at this',
    });
  });
});

/**
 * `!tts` from chat. It is the free door onto the stream, so what decides its fate has to be the
 * channel's own settings and nothing chat-specific.
 */
describe('submitChatText', () => {
  const say = async (twitchId: string, text: string) => {
    const { submissionId, autoApproved } = await submitChatText(deps, {
      channelId,
      broadcasterId,
      text,
      senderTwitchId: twitchId,
      senderName: 'viewer',
    });
    const row = await db.select().from(submissions).where(eq(submissions.id, submissionId)).get();
    return { autoApproved, text: row?.text ?? null, kind: row?.kind };
  };

  beforeEach(async () => {
    channelId = await makeChannel();
    broadcasterId = `tw_b_${crypto.randomUUID()}`;
    const io = fakeIo().io;
    deps = { playback: new PlaybackManager(io), io };
  });

  it('waits for review while the channel does not auto-approve text', async () => {
    const { twitchId } = await makeViewer();
    expect(await say(twitchId, 'hello stream')).toEqual({
      autoApproved: false,
      text: 'hello stream',
      kind: 'text',
    });
  });

  it('airs at once once the streamer opted into viewer text', async () => {
    channelId = await makeChannel({ autoApproveText: true });
    const { twitchId } = await makeViewer();
    expect((await say(twitchId, 'hello stream')).autoApproved).toBe(true);
  });

  it('airs for a whitelisted viewer even without that setting', async () => {
    const { twitchId, userId } = await makeViewer();
    await db.insert(whitelist).values({ channelId, userId, createdAt: new Date() });
    expect((await say(twitchId, 'hello stream')).autoApproved).toBe(true);
  });

  // A line bought with points must carry the redemption, or nothing can ever give them back.
  it('owes the redemption behind a paid line, scaled by what was spent', async () => {
    const { twitchId } = await makeViewer();
    const { submissionId } = await submitChatText(deps, {
      channelId,
      broadcasterId,
      text: 'hello stream',
      senderTwitchId: twitchId,
      senderName: 'viewer',
      redemption: { rewardId: 'rw_1', redemptionId: 'rd_1', cost: 1000 },
    });
    const payout = await db
      .select()
      .from(submissionPayouts)
      .where(eq(submissionPayouts.submissionId, submissionId))
      .get();
    expect(payout).toMatchObject({
      redemptionId: 'rd_1',
      rewardId: 'rw_1',
      dust: CHANNEL_POINTS.dustForRequest(1000),
      settledAt: null,
    });
  });

  /**
   * The streamer testing their own reward used to get no payout row at all — and that row is the
   * only thing that tells Twitch the redemption is done. Without it the redemption stayed
   * UNFULFILLED, the startup backlog sweep read it as never seen, and every deploy put the same
   * line back on stream.
   */
  it('owes a paid self-send too, at zero dust', async () => {
    const { submissionId } = await submitChatText(deps, {
      channelId,
      broadcasterId,
      text: 'testing my own reward',
      senderTwitchId: broadcasterId,
      senderName: 'streamer',
      redemption: { rewardId: 'rw_1', redemptionId: 'rd_self', cost: 1000 },
    });
    const payout = await db
      .select()
      .from(submissionPayouts)
      .where(eq(submissionPayouts.submissionId, submissionId))
      .get();
    expect(payout).toMatchObject({ redemptionId: 'rd_self', dust: 0, mirrorDust: 0 });
  });

  // A free self-send has neither dust nor a verdict to deliver, so it still writes nothing.
  it('writes no row for a self-send with no points behind it', async () => {
    const { submissionId } = await submitChatText(deps, {
      channelId,
      broadcasterId,
      text: 'just talking',
      senderTwitchId: broadcasterId,
      senderName: 'streamer',
    });
    const payout = await db
      .select()
      .from(submissionPayouts)
      .where(eq(submissionPayouts.submissionId, submissionId))
      .get();
    expect(payout).toBeUndefined();
  });

  // The command refuses an over-long line outright; this is the belt to that pair of braces.
  it('never stores more than the chat cap', async () => {
    const { twitchId } = await makeViewer();
    const { text } = await say(twitchId, 'x'.repeat(CHAT_TEXT_MAX_LEN + 50));
    expect(text).toHaveLength(CHAT_TEXT_MAX_LEN);
  });
});
