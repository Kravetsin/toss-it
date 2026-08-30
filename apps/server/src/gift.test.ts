import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { GIFT } from '@tmw/shared';
import { db } from './db/index';
import { channelActivity, dustGifts, linkedIdentities, pendingDust, users } from './db/schema';
import { findGiftTargets, giftDust } from './gift';

/**
 * Handing dust to someone else. Everything here is about the money landing where it should and
 * nowhere else — a transfer between two people is the one operation where a bug takes something
 * from a real person and gives it to another.
 */
describe('gifting dust', () => {
  let giver: string;
  let taker: string;
  let takerLogin: string;
  let strangerTwitch: string;
  let strangerLogin: string;

  const dustOf = async (id: string) =>
    (await db
      .select({ d: users.stardust, e: users.dustEarned })
      .from(users)
      .where(eq(users.id, id))
      .get())!;

  /**
   * A real account, id and all: every row is created by a provider, so its id is `twitch:<id>` or
   * `google:<sub>` — which is what tells the chat lookup whose namespace a name belongs to.
   */
  const makeUser = async (
    login: string,
    stardust: number,
    extra: { provider?: 'twitch' | 'google'; displayName?: string; platformName?: string } = {},
  ) => {
    const provider = extra.provider ?? 'twitch';
    const providerId = crypto.randomUUID();
    const id = `${provider}:${providerId}`;
    await db.insert(users).values({
      id,
      login,
      displayName: extra.displayName ?? login,
      platformName: extra.platformName ?? extra.displayName ?? login,
      avatarUrl: null,
      stardust,
      createdAt: new Date(),
    });
    await db
      .insert(linkedIdentities)
      .values({ userId: id, provider, providerId, createdAt: new Date() });
    return { id, providerId };
  };

  beforeEach(async () => {
    giver = (await makeUser(`giver_${crypto.randomUUID().slice(0, 8)}`, 5000)).id;
    strangerTwitch = `tw_${crypto.randomUUID()}`;
    strangerLogin = `stranger_${crypto.randomUUID().slice(0, 8)}`;
    takerLogin = `taker_${crypto.randomUUID().slice(0, 8)}`;
    taker = (await makeUser(takerLogin, 100)).id;
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

  // The fallback exists for exactly this: a Twitch display name nobody here has ever chatted
  // under, which Helix cannot look up either because users?login= only takes logins.
  it('finds an account by the Twitch name behind a bought one', async () => {
    await db
      .update(users)
      .set({ displayName: 'Куплённое Имя', platformName: 'РеальныйНик' })
      .where(eq(users.id, taker));
    const res = await giftDust({ fromUserId: giver, to: { login: '@РеальныйНик' }, amount: 100 });
    expect(res).toMatchObject({ kind: 'done', toName: 'РеальныйНик' });
    expect((await dustOf(taker)).d).toBe(200);
  });

  // A name bought here exists only on Tossit. Honouring it in Twitch chat would let 1000 dust buy
  // the name of a streamer with no account and collect the gifts meant for them.
  it('never resolves a Tossit-only name from Twitch chat', async () => {
    await db.update(users).set({ displayName: 'Мелхарис' }).where(eq(users.id, taker));
    const res = await giftDust({ fromUserId: giver, to: { login: 'Мелхарис' }, amount: 100 });
    expect(res.kind).toBe('unknown');
    expect((await dustOf(giver)).d).toBe(5000);
  });

  // A Google-primary login is an email local part — a name in nobody's Twitch namespace.
  it('never resolves a Google account by its login from Twitch chat', async () => {
    const g = await makeUser('johnsmith', 0, { provider: 'google', displayName: 'John Smith' });
    await db.insert(linkedIdentities).values({
      userId: g.id,
      provider: 'twitch',
      providerId: `tw_${crypto.randomUUID()}`,
      createdAt: new Date(),
    });
    expect(
      (await giftDust({ fromUserId: giver, to: { login: 'johnsmith' }, amount: 100 })).kind,
    ).toBe('unknown');
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

  // The site door, which searches the opposite namespace: the names Tossit shows.
  describe('finding someone from the site', () => {
    // SQLite's lower() folds ASCII only, so this whole class of name used to be unfindable.
    it('finds a Cyrillic name however it was typed', async () => {
      await makeUser(`zv_${crypto.randomUUID().slice(0, 8)}`, 0, { displayName: 'Звёздный' });
      for (const q of ['Звёзд', 'звёзд', 'звезд']) {
        expect((await findGiftTargets(q, giver)).map((r) => r.displayName)).toContain('Звёздный');
      }
    });

    it('finds someone by the provider name a bought one is hiding', async () => {
      await db
        .update(users)
        .set({ displayName: 'Куплённое Имя', platformName: 'Kravets' })
        .where(eq(users.id, taker));
      const [hit] = await findGiftTargets('krav', giver);
      // Sent only because it differs — that is what makes the row identifiable in the picker.
      expect(hit).toMatchObject({
        userId: taker,
        displayName: 'Куплённое Имя',
        platformName: 'Kravets',
      });
    });

    it('says nothing about the giver, or about a query too short to mean anything', async () => {
      const giverLogin = (await db.select().from(users).where(eq(users.id, giver)).get())!.login;
      expect(await findGiftTargets(giverLogin, giver)).toEqual([]);
      expect(await findGiftTargets('a', giver)).toEqual([]);
    });

    // A LIKE pattern used to reach the query: '%' matched everyone and filled the picker.
    it('treats a wildcard as text, not as a pattern', async () => {
      expect(await findGiftTargets('%', giver)).toEqual([]);
      expect(await findGiftTargets('%%', giver)).toEqual([]);
    });
  });

  it('refuses the cases that would only confuse, without moving anything', async () => {
    const giverLogin = (await db.select().from(users).where(eq(users.id, giver)).get())!.login;

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
