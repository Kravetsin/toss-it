import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { GIFT } from '@tmw/shared';
import { db } from './db/index';
import { channelActivity, dustGifts, linkedIdentities, pendingDust, users } from './db/schema';
import { giftDust } from './gift';

/**
 * Handing dust to someone else. Everything here is about the money landing where it should and
 * nowhere else — a transfer between two people is the one operation where a bug takes something
 * from a real person and gives it to another.
 */
describe('gifting dust', () => {
  let giver: string;
  let taker: string;
  let takerTwitch: string;
  let strangerTwitch: string;
  let strangerLogin: string;

  const dustOf = async (id: string) =>
    (await db
      .select({ d: users.stardust, e: users.dustEarned })
      .from(users)
      .where(eq(users.id, id))
      .get())!;

  const makeUser = async (login: string, stardust: number) => {
    const id = `u_${crypto.randomUUID()}`;
    await db
      .insert(users)
      .values({ id, login, displayName: login, avatarUrl: null, stardust, createdAt: new Date() });
    return id;
  };

  beforeEach(async () => {
    giver = await makeUser(`giver_${crypto.randomUUID().slice(0, 8)}`, 5000);
    takerTwitch = `tw_${crypto.randomUUID()}`;
    strangerTwitch = `tw_${crypto.randomUUID()}`;
    strangerLogin = `stranger_${crypto.randomUUID().slice(0, 8)}`;
    const takerLogin = `taker_${crypto.randomUUID().slice(0, 8)}`;
    taker = await makeUser(takerLogin, 100);
    await db.insert(linkedIdentities).values({
      userId: taker,
      provider: 'twitch',
      providerId: takerTwitch,
      createdAt: new Date(),
    });
    // Seen in a chat but never signed up — the case that makes a gift an invitation.
    await db.insert(channelActivity).values({
      channelId: 'ch',
      platform: 'twitch',
      platformUserId: strangerTwitch,
      month: '2026-08',
      displayName: 'Stranger',
      login: strangerLogin,
      messages: 3,
      watchMinutes: 0,
      updatedAt: new Date(),
    });
  });

  it('moves the dust and records who gave it', async () => {
    const takerLogin = (await db.select().from(users).where(eq(users.id, taker)).get())!.login;
    const res = await giftDust({ fromUserId: giver, toLogin: takerLogin, amount: 500 });
    expect(res).toMatchObject({ kind: 'done', amount: 500 });
    expect((await dustOf(giver)).d).toBe(4500);
    expect((await dustOf(taker)).d).toBe(600);

    const row = await db.select().from(dustGifts).where(eq(dustGifts.fromUserId, giver)).get();
    expect(row).toMatchObject({ amount: 500, toUserId: taker });
  });

  // A gift is a transfer, not contribution. If it counted as earnings, the wealth cosmetics would
  // stop measuring what someone did for a channel and start measuring who they know.
  it('never counts as lifetime earned, on either side', async () => {
    const takerLogin = (await db.select().from(users).where(eq(users.id, taker)).get())!.login;
    await giftDust({ fromUserId: giver, toLogin: takerLogin, amount: 500 });
    expect((await dustOf(taker)).e).toBe(0);
    expect((await dustOf(giver)).e).toBe(0);
  });

  // The whole reason gifting a stranger is worth having: it is also an invitation.
  it('holds a gift for someone who has never signed up', async () => {
    const res = await giftDust({ fromUserId: giver, toLogin: strangerLogin, amount: 300 });
    expect(res.kind).toBe('done');
    const held = await db
      .select({ amount: pendingDust.amount })
      .from(pendingDust)
      .where(
        and(eq(pendingDust.platform, 'twitch'), eq(pendingDust.platformUserId, strangerTwitch)),
      )
      .get();
    expect(held?.amount).toBe(300);
    expect((await dustOf(giver)).d).toBe(4700);
  });

  it('takes the login as typed, @ and capitals included', async () => {
    const res = await giftDust({
      fromUserId: giver,
      toLogin: `  @${strangerLogin.toUpperCase()} `,
      amount: 100,
    });
    expect(res.kind).toBe('done');
  });

  it('asks Twitch only for a login nobody here has seen', async () => {
    let asked = 0;
    const res = await giftDust(
      { fromUserId: giver, toLogin: strangerLogin, amount: 100 },
      async () => {
        asked++;
        return null;
      },
    );
    expect(res.kind).toBe('done');
    expect(asked).toBe(0);

    const remote = await giftDust(
      { fromUserId: giver, toLogin: 'nobody_here', amount: 100 },
      async () => {
        asked++;
        return { id: 'tw_remote', login: 'nobody_here' };
      },
    );
    expect(remote.kind).toBe('done');
    expect(asked).toBe(1);
  });

  it('refuses the cases that would only confuse, without moving anything', async () => {
    const giverLogin = (await db.select().from(users).where(eq(users.id, giver)).get())!.login;
    await db.insert(linkedIdentities).values({
      userId: giver,
      provider: 'twitch',
      providerId: `tw_${crypto.randomUUID()}`,
      createdAt: new Date(),
    });

    expect((await giftDust({ fromUserId: giver, toLogin: giverLogin, amount: 100 })).kind).toBe(
      'self',
    );
    expect(
      (await giftDust({ fromUserId: giver, toLogin: strangerLogin, amount: GIFT.min - 1 })).kind,
    ).toBe('tooSmall');
    expect((await giftDust({ fromUserId: giver, toLogin: 'ghost_nobody', amount: 100 })).kind).toBe(
      'unknown',
    );
    expect(
      (await giftDust({ fromUserId: giver, toLogin: strangerLogin, amount: 99_999 })).kind,
    ).toBe('noFunds');
    // Nothing left the giver through any of those.
    expect((await dustOf(giver)).d).toBe(5000);
  });
});
