import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { NAME_CHANGE_DUST } from '@tmw/shared';
import { db } from './db/index';
import { nameChanges, users } from './db/schema';
import { buyDisplayName, clearDisplayName, dustSpentOnNames, setPlatformName } from './displayName';

/**
 * Buying a display name. The rules themselves are pinned in @tmw/shared; what matters here is the
 * money and the identity: nothing is charged for a name that was refused, a bought name survives
 * the provider changing theirs, and nobody can wear an account that exists.
 */
describe('bought display name', () => {
  let userId: string;

  const read = async (id = userId) =>
    (await db
      .select({
        displayName: users.displayName,
        platformName: users.platformName,
        customNameAt: users.customNameAt,
        stardust: users.stardust,
        login: users.login,
      })
      .from(users)
      .where(eq(users.id, id))
      .get())!;

  const insert = async (id: string, login: string, name: string, dust = 0) => {
    await db.insert(users).values({
      id,
      login,
      displayName: name,
      platformName: name,
      avatarUrl: null,
      stardust: dust,
      createdAt: new Date(),
    });
  };

  beforeEach(async () => {
    userId = `u_${crypto.randomUUID()}`;
    await insert(userId, `l_${userId}`, 'Provider Name', NAME_CHANGE_DUST * 2);
  });

  it('charges the price and shows the new name', async () => {
    const res = await buyDisplayName(userId, 'Дракон');
    expect(res).toMatchObject({ ok: true, name: 'Дракон' });
    const row = await read();
    expect(row.displayName).toBe('Дракон');
    expect(row.stardust).toBe(NAME_CHANGE_DUST);
    expect(row.customNameAt).not.toBeNull();
  });

  // The provider's name stays underneath: it is what moderation acts on and what the hover shows.
  it('keeps the provider name underneath', async () => {
    await buyDisplayName(userId, 'Дракон');
    expect((await read()).platformName).toBe('Provider Name');
  });

  // The point of the whole feature: a rename on Twitch must not wipe out what someone paid for.
  it('survives the provider renaming the account', async () => {
    await buyDisplayName(userId, 'Дракон');
    await setPlatformName(userId, 'Renamed On Twitch', 'renamed_login');
    const row = await read();
    expect(row.displayName).toBe('Дракон');
    expect(row.platformName).toBe('Renamed On Twitch');
    expect(row.login).toBe('renamed_login');
  });

  it('follows the provider again for anyone who bought nothing', async () => {
    await setPlatformName(userId, 'Renamed On Twitch');
    expect((await read()).displayName).toBe('Renamed On Twitch');
  });

  it('gives the provider name back for free', async () => {
    await buyDisplayName(userId, 'Дракон');
    const before = (await read()).stardust;
    await clearDisplayName(userId);
    const row = await read();
    expect(row.displayName).toBe('Provider Name');
    expect(row.customNameAt).toBeNull();
    expect(row.stardust).toBe(before);
  });

  // A refused name must never cost anything — validation runs before the charge.
  it('charges nothing for a name it refuses', async () => {
    for (const bad of ['x', 'a'.repeat(40), '​​​']) {
      expect(await buyDisplayName(userId, bad)).toMatchObject({ ok: false });
    }
    const row = await read();
    expect(row.stardust).toBe(NAME_CHANGE_DUST * 2);
    expect(row.displayName).toBe('Provider Name');
  });

  it('refuses when the wallet is short, and takes nothing', async () => {
    const poor = `u_${crypto.randomUUID()}`;
    await insert(poor, `l_${poor}`, 'Poor', NAME_CHANGE_DUST - 1);
    expect(await buyDisplayName(poor, 'Дракон')).toMatchObject({ ok: false, problem: 'poor' });
    expect((await read(poor)).stardust).toBe(NAME_CHANGE_DUST - 1);
  });

  describe('impersonation', () => {
    it("refuses another account's real name, even spelled with look-alikes", async () => {
      const victim = `u_${crypto.randomUUID()}`;
      await insert(victim, `l_${victim}`, 'Kravets');
      // The second 'а' here is Cyrillic: identical on screen, a different code point.
      expect(await buyDisplayName(userId, 'Krаvets')).toMatchObject({
        ok: false,
        problem: 'taken',
      });
      expect((await read()).stardust).toBe(NAME_CHANGE_DUST * 2);
    });

    it("refuses another account's login", async () => {
      const victim = `u_${crypto.randomUUID()}`;
      await insert(victim, 'night_driver', 'Someone Else');
      expect(await buyDisplayName(userId, 'Night Driver')).toMatchObject({
        ok: false,
        problem: 'taken',
      });
    });

    // Two people may both be Дракон: a bought name claims nobody in particular, which is exactly
    // what Twitch's global-uniqueness rule cannot allow and what this item exists to give back.
    it('allows a name another viewer also bought', async () => {
      const twin = `u_${crypto.randomUUID()}`;
      await insert(twin, `l_${twin}`, 'Twin', NAME_CHANGE_DUST);
      expect(await buyDisplayName(twin, 'Дракон')).toMatchObject({ ok: true });
      expect(await buyDisplayName(userId, 'Дракон')).toMatchObject({ ok: true });
    });
  });

  // user_cosmetics cannot hold this (one row per item, and a name may be bought again and again),
  // so the ledger is what keeps the 'dustSpent' axis honest about this sink.
  it('records every purchase for the dust-spent axis', async () => {
    await buyDisplayName(userId, 'Дракон');
    await buyDisplayName(userId, 'Дракоша');
    expect(await dustSpentOnNames(userId)).toBe(NAME_CHANGE_DUST * 2);
    const rows = await db
      .select({ name: nameChanges.name })
      .from(nameChanges)
      .where(eq(nameChanges.userId, userId))
      .all();
    expect(rows.map((r) => r.name)).toEqual(['Дракон', 'Дракоша']);
  });
});
