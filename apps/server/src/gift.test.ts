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
      displayName: '长尺丹丷乇丁丂',
      login: strangerLogin,
      messages: 3,
      watchMinutes: 0,
      updatedAt: new Date(),
    });
  });

  it('moves the dust and records who gave it', async () => {
    const takerLogin = (await db.select().from(users).where(eq(users.id, taker)).get())!.login;
    const res = await giftDust({ fromUserId: giver, to: { login: takerLogin }, amount: 500 });
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
    await giftDust({ fromUserId: giver, to: { login: takerLogin }, amount: 500 });
    expect((await dustOf(taker)).e).toBe(0);
    expect((await dustOf(giver)).e).toBe(0);
  });

  // The whole reason gifting a stranger is worth having: it is also an invitation.
  it('holds a gift for someone who has never signed up', async () => {
    const res = await giftDust({ fromUserId: giver, to: { login: strangerLogin }, amount: 300 });
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

  // Twitch's chat autocomplete inserts the DISPLAY name, and for an international one that is a
  // completely different string from the login — which Helix's users?login= cannot look up either.
  it('finds someone by the display name Twitch autocompletes', async () => {
    const res = await giftDust({
      fromUserId: giver,
      to: { login: '@长尺丹丷乇丁丂' },
      amount: 100,
    });
    // Addressed by the name Twitch shows, not the login — a mention is a text match on either.
    expect(res).toMatchObject({ kind: 'done', toName: '长尺丹丷乇丁丂' });
  });

  // SQLite's lower() only folds ASCII, so a Cyrillic name has to match as typed.
  it('finds a display name whose capitals no lower() would fold', async () => {
    const tw = `tw_${crypto.randomUUID()}`;
    await db.insert(channelActivity).values({
      channelId: 'ch',
      platform: 'twitch',
      platformUserId: tw,
      month: '2026-08',
      displayName: 'Звёздный',
      login: `zv_${crypto.randomUUID().slice(0, 8)}`,
      messages: 1,
      watchMinutes: 0,
      updatedAt: new Date(),
    });
    const res = await giftDust({
      fromUserId: giver,
      to: { login: '@Звёздный' },
      amount: 100,
      channelId: 'ch',
    });
    expect(res).toMatchObject({ kind: 'done', toName: 'Звёздный' });
  });

  // A name bought on Tossit means nothing on Twitch: pinging it would highlight for nobody.
  it('never addresses someone by a display name they bought here', async () => {
    await db.update(users).set({ displayName: 'Куплённое Имя' }).where(eq(users.id, taker));
    const takerLogin = (await db.select().from(users).where(eq(users.id, taker)).get())!.login;
    const res = await giftDust({ fromUserId: giver, to: { login: takerLogin }, amount: 100 });
    expect(res).toMatchObject({ kind: 'done', toName: takerLogin });
  });

  // Display names are not unique the way logins are, so the person in the room wins.
  it('prefers a sighting in the channel the command was typed in', async () => {
    const elsewhere = `tw_${crypto.randomUUID()}`;
    await db.insert(channelActivity).values({
      channelId: 'other',
      platform: 'twitch',
      platformUserId: elsewhere,
      month: '2026-08',
      displayName: '长尺丹丷乇丁丂',
      login: `other_${crypto.randomUUID().slice(0, 8)}`,
      messages: 99,
      watchMinutes: 0,
      // Newer, so without the channel preference this row would win.
      updatedAt: new Date(Date.now() + 60_000),
    });
    const res = await giftDust({
      fromUserId: giver,
      to: { login: '长尺丹丷乇丁丂' },
      amount: 100,
      channelId: 'ch',
    });
    // Both rows carry the same display name, so only WHERE the dust landed tells them apart.
    expect(res.kind).toBe('done');
    const stray = await db
      .select({ amount: pendingDust.amount })
      .from(pendingDust)
      .where(and(eq(pendingDust.platform, 'twitch'), eq(pendingDust.platformUserId, elsewhere)))
      .get();
    expect(stray).toBeUndefined();
  });

  it('takes the login as typed, @ and capitals included', async () => {
    const res = await giftDust({
      fromUserId: giver,
      to: { login: `  @${strangerLogin.toUpperCase()} ` },
      amount: 100,
    });
    expect(res.kind).toBe('done');
  });

  it('asks Twitch only for a login nobody here has seen', async () => {
    let asked = 0;
    const res = await giftDust(
      { fromUserId: giver, to: { login: strangerLogin }, amount: 100 },
      async () => {
        asked++;
        return null;
      },
    );
    expect(res.kind).toBe('done');
    expect(asked).toBe(0);

    const remote = await giftDust(
      { fromUserId: giver, to: { login: 'nobody_here' }, amount: 100 },
      async () => {
        asked++;
        return { id: 'tw_remote', login: 'nobody_here', name: 'Nobody_Here' };
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

    expect(
      (await giftDust({ fromUserId: giver, to: { login: giverLogin }, amount: 100 })).kind,
    ).toBe('self');
    expect(
      (await giftDust({ fromUserId: giver, to: { login: strangerLogin }, amount: GIFT.min - 1 }))
        .kind,
    ).toBe('tooSmall');
    expect(
      (await giftDust({ fromUserId: giver, to: { login: 'ghost_nobody' }, amount: 100 })).kind,
    ).toBe('unknown');
    expect(
      (await giftDust({ fromUserId: giver, to: { login: strangerLogin }, amount: 99_999 })).kind,
    ).toBe('noFunds');
    // Nothing left the giver through any of those.
    expect((await dustOf(giver)).d).toBe(5000);
  });
});
