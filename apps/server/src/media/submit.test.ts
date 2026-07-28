import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeIo, makeChannel } from '../../test/fakes';
import { db } from '../db/index';
import { linkedIdentities, submissions, users, whitelist } from '../db/schema';
import { PlaybackManager } from '../playback';
import { parseYoutube } from './youtube';
import { CHAT_TEXT_MAX_LEN } from '@tmw/shared';
import { acceptsSends, dropsCaption, submitChatText, submitResolvedYoutube } from './submit';

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

  // The command refuses an over-long line outright; this is the belt to that pair of braces.
  it('never stores more than the chat cap', async () => {
    const { twitchId } = await makeViewer();
    const { text } = await say(twitchId, 'x'.repeat(CHAT_TEXT_MAX_LEN + 50));
    expect(text).toHaveLength(CHAT_TEXT_MAX_LEN);
  });
});
