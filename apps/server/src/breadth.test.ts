import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { breadthProgress, type CosmeticEarn } from '@tmw/shared';
import { makeChannel, makeSubmission } from '../test/fakes';
import { db } from './db/index';
import { channelActivity, linkedIdentities, users } from './db/schema';
import { breadthFor, noteChatModerator } from './level';

/**
 * The breadth axis: seals earned by doing something in SEVERAL channels rather than a lot in one.
 * Every case here is one a viewer can feel — a channel that shouldn't count, a total that would
 * pass but a spread that shouldn't, or a milestone quietly un-earning itself.
 */
describe('breadth totals', () => {
  let userId: string;
  let twitchId: string;

  const chat = async (channelId: string, messages: number, watchMinutes = 0, month = '2026-08') => {
    await db.insert(channelActivity).values({
      channelId,
      platform: 'twitch',
      platformUserId: twitchId,
      month,
      displayName: 'tester',
      login: 'tester',
      messages,
      watchMinutes,
      updatedAt: new Date(),
    });
  };

  beforeEach(async () => {
    userId = `u_${crypto.randomUUID()}`;
    twitchId = `tw_${crypto.randomUUID()}`;
    await db.insert(users).values({
      id: userId,
      login: userId,
      displayName: userId,
      avatarUrl: null,
      createdAt: new Date(),
    });
    await db.insert(linkedIdentities).values({
      userId,
      provider: 'twitch',
      providerId: twitchId,
      createdAt: new Date(),
    });
  });

  it('counts each channel once, summing its monthly buckets', async () => {
    const a = await makeChannel();
    await chat(a, 60, 0, '2026-07');
    await chat(a, 45, 0, '2026-08');

    const totals = await breadthFor(userId);
    expect(totals.messages).toEqual([105]);
  });

  it('is about the spread, not the total', async () => {
    const loud = await makeChannel();
    const quiet = await makeChannel();
    await chat(loud, 900);
    await chat(quiet, 10);

    const totals = await breadthFor(userId);
    const rung: CosmeticEarn = { metric: 'channelsMessaged', count: 5, per: 25 };
    // 910 messages in total and still nowhere near it: only one channel clears the bar.
    expect(breadthProgress(rung, totals)).toBe(1);
  });

  it('counts a channel toward the rungs whose bar it clears', async () => {
    for (const n of [420, 180, 96, 41, 12]) await chat(await makeChannel(), n);
    const totals = await breadthFor(userId);

    expect(breadthProgress({ metric: 'channelsMessaged', count: 5, per: 25 }, totals)).toBe(4);
    expect(breadthProgress({ metric: 'channelsMessaged', count: 5, per: 100 }, totals)).toBe(2);
    expect(breadthProgress({ metric: 'channelsMessaged', count: 5, per: 250 }, totals)).toBe(1);
  });

  it('counts watch time per channel, in minutes', async () => {
    await chat(await makeChannel(), 0, 1800);
    await chat(await makeChannel(), 0, 700);
    await chat(await makeChannel(), 0, 240);
    const totals = await breadthFor(userId);

    // 10 h clears in two channels, 25 h in one — the rings' first two rungs.
    expect(breadthProgress({ metric: 'channelsWatched', count: 3, per: 600 }, totals)).toBe(2);
    expect(breadthProgress({ metric: 'channelsWatched', count: 3, per: 1500 }, totals)).toBe(1);
  });

  it('counts submissions per channel and ignores self-sends', async () => {
    const a = await makeChannel();
    const b = await makeChannel();
    for (let i = 0; i < 3; i++) await makeSubmission(a, { senderUserId: userId });
    await makeSubmission(b, { senderUserId: userId });
    // A streamer's own send must not earn them a breadth seal on their own channel.
    await makeSubmission(b, { senderUserId: userId, isSelfSend: true });

    const totals = await breadthFor(userId);
    expect(totals.submissions).toEqual([3, 1]);
    expect(breadthProgress({ metric: 'channelsSent', count: 5, per: 3 }, totals)).toBe(1);
  });

  it('remembers a moderator sighting once, and forever', async () => {
    const a = await makeChannel();
    const b = await makeChannel();
    await noteChatModerator(a, 'twitch', twitchId);
    // The same chatter talking again must not double-count the channel.
    await noteChatModerator(a, 'twitch', twitchId);
    await noteChatModerator(b, 'twitch', twitchId);

    const totals = await breadthFor(userId);
    expect(totals.moderated).toBe(2);
    expect(breadthProgress({ metric: 'channelsModerated', count: 3 }, totals)).toBe(2);
  });

  it('gives an account with no identity an empty payload rather than throwing', async () => {
    const stranger = `u_${crypto.randomUUID()}`;
    await db.insert(users).values({
      id: stranger,
      login: stranger,
      displayName: stranger,
      avatarUrl: null,
      createdAt: new Date(),
    });

    const totals = await breadthFor(stranger);
    expect(totals).toEqual({ messages: [], submissions: [], watchMinutes: [], moderated: 0 });
  });
});
