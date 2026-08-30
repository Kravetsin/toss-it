import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { BET, maxBet, PAYOUT, WHEEL_ORDER } from '@tmw/shared';
import { db } from './db/index';
import { linkedIdentities, pendingDust, rouletteSpins, users } from './db/schema';
import { placeBet, slotFor } from './roulette';

/**
 * The wheel. Everything here is about money moving correctly — the odds themselves are arithmetic
 * and are checked in the shared package. What can actually go wrong in production is a stake that
 * is taken twice, a payout that inflates the wrong counter, or an unregistered player who cannot
 * lose (which would make "never register" the winning strategy).
 */
describe('roulette payouts', () => {
  let userId: string;
  let twitchId: string;

  const account = async () =>
    (await db
      .select({ stardust: users.stardust, earned: users.dustEarned })
      .from(users)
      .where(eq(users.id, userId))
      .get())!;

  const pending = async () =>
    (
      await db
        .select({ amount: pendingDust.amount })
        .from(pendingDust)
        .where(and(eq(pendingDust.platform, 'twitch'), eq(pendingDust.platformUserId, twitchId)))
        .get()
    )?.amount ?? 0;

  /** Spin until the wheel gives this colour. The cooldown is per player, so each try is a new one. */
  const spinUntil = async (want: 'win' | 'lose', color: 'red' | 'black' = 'red') => {
    for (let i = 0; i < 200; i++) {
      const id = `u_${crypto.randomUUID()}`;
      await db.insert(users).values({
        id,
        login: id,
        displayName: id,
        avatarUrl: null,
        stardust: 1000,
        createdAt: new Date(),
      });
      const res = await placeBet({
        channelId: null,
        platform: 'tossit',
        platformUserId: id,
        userId: id,
        stake: 100,
        color,
      });
      if (res.kind !== 'done') throw new Error(`unexpected ${res.kind}`);
      const won = res.payout > 0;
      if ((want === 'win') === won) return { res, id };
    }
    throw new Error('wheel never produced the wanted outcome');
  };

  beforeEach(async () => {
    userId = `u_${crypto.randomUUID()}`;
    twitchId = `tw_${crypto.randomUUID()}`;
    await db.insert(users).values({
      id: userId,
      login: userId,
      displayName: userId,
      avatarUrl: null,
      stardust: 5000,
      createdAt: new Date(),
    });
  });

  it('pays the stake back doubled on a win, and takes it on a loss', async () => {
    const win = await spinUntil('win');
    expect(win.res.payout).toBe(100 * PAYOUT.red);
    expect((await db.select().from(users).where(eq(users.id, win.id)).get())!.stardust).toBe(
      1000 - 100 + 100 * PAYOUT.red,
    );

    const loss = await spinUntil('lose');
    expect(loss.res.payout).toBe(0);
    expect((await db.select().from(users).where(eq(users.id, loss.id)).get())!.stardust).toBe(900);
  });

  // A grant is not contribution. dustEarned gates the wealth cosmetics, and a lucky spin must not
  // move them — which is why this deliberately does not go through creditDust.
  it('never touches lifetime earned', async () => {
    const { id } = await spinUntil('win');
    const row = await db.select().from(users).where(eq(users.id, id)).get();
    expect(row!.dustEarned).toBe(0);
  });

  it('refuses a second spin inside the cooldown', async () => {
    const first = await placeBet({
      channelId: null,
      platform: 'tossit',
      platformUserId: userId,
      userId,
      stake: 100,
      color: 'red',
    });
    expect(first.kind).toBe('done');
    const second = await placeBet({
      channelId: null,
      platform: 'tossit',
      platformUserId: userId,
      userId,
      stake: 100,
      color: 'red',
    });
    expect(second.kind).toBe('cooldown');
    // A refused bet must not have cost anything.
    const after = await account();
    expect(after.stardust).toBe(5000 - 100 + (first.kind === 'done' ? first.payout : 0));
  });

  it('refuses a stake over the cap without charging for it', async () => {
    const res = await placeBet({
      channelId: null,
      platform: 'tossit',
      platformUserId: userId,
      userId,
      stake: 5000,
      color: 'red',
    });
    expect(res).toEqual({ kind: 'overCap', max: maxBet(5000), balance: 5000 });
    expect((await account()).stardust).toBe(5000);
  });

  it('refuses a stake under the floor', async () => {
    const res = await placeBet({
      channelId: null,
      platform: 'tossit',
      platformUserId: userId,
      userId,
      stake: BET.min - 1,
      color: 'red',
    });
    expect(res).toEqual({ kind: 'tooSmall', min: BET.min });
    expect((await account()).stardust).toBe(5000);
  });

  // Risk-free spins for the unregistered would make never signing up the dominant strategy, so the
  // dust we are holding for a chatter is real money to them: it can grow and it can go.
  it('plays an unregistered chatter out of pending dust, losses included', async () => {
    await db.insert(pendingDust).values({
      platform: 'twitch',
      platformUserId: twitchId,
      amount: 2000,
      updatedAt: new Date(),
    });
    const res = await placeBet({
      channelId: 'ch',
      platform: 'twitch',
      platformUserId: twitchId,
      userId: null,
      stake: 200,
      color: 'red',
    });
    if (res.kind !== 'done') throw new Error(`unexpected ${res.kind}`);
    expect(await pending()).toBe(2000 - 200 + res.payout);
    // No account was touched or invented for them.
    expect(
      await db
        .select()
        .from(linkedIdentities)
        .where(eq(linkedIdentities.providerId, twitchId))
        .get(),
    ).toBeUndefined();
  });

  it('records every spin against the seed that produced it', async () => {
    const res = await placeBet({
      channelId: 'ch',
      platform: 'tossit',
      platformUserId: userId,
      userId,
      stake: 100,
      color: 'black',
    });
    if (res.kind !== 'done') throw new Error(`unexpected ${res.kind}`);
    const row = await db.select().from(rouletteSpins).where(eq(rouletteSpins.userId, userId)).get();
    expect(row).toMatchObject({ stake: 100, betColor: 'black', slot: res.slot, channelId: 'ch' });
  });
});

/** The commitment chain: without these two properties "provably fair" is just a word. */
describe('roulette fairness', () => {
  it('reproduces a slot from the revealed seed alone', () => {
    const seed = crypto.randomBytes(32).toString('hex');
    expect(slotFor(seed, 7)).toBe(slotFor(seed, 7));
    expect(slotFor(seed, 7)).not.toBe(slotFor(seed, 8));
  });

  it('lands inside the wheel for every nonce it will ever see', () => {
    const seed = crypto.randomBytes(32).toString('hex');
    for (let n = 0; n < 2000; n++) {
      const slot = slotFor(seed, n);
      expect(WHEEL_ORDER).toContain(slot);
    }
  });
});
