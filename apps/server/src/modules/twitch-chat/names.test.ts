import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from '../../db/index';
import { users } from '../../db/schema';
import { refreshChatterName, resetNameChecks } from './names';

/**
 * Names refreshed from chat. What matters in production is the split this fixes (the overlay had
 * the new nick, every stored surface had the old one) and the three ways it could misbehave:
 * writing on every message, repainting an account Twitch does not own, and dying on the unique
 * login index when a renamed login is already taken.
 */
describe('name refresh from chat', () => {
  const log = { info: () => {}, warn: () => {} } as unknown as FastifyBaseLogger;
  let twitchId: string;
  let userId: string;

  const read = async (id: string) =>
    (await db
      .select({ login: users.login, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, id))
      .get())!;

  const insert = async (id: string, login: string, displayName: string) => {
    await db
      .insert(users)
      .values({ id, login, displayName, avatarUrl: null, createdAt: new Date() });
  };

  beforeEach(async () => {
    resetNameChecks();
    twitchId = `${Math.floor(Math.random() * 1e9)}`;
    userId = `twitch:${twitchId}`;
    await insert(userId, `old_${twitchId}`, `Old_${twitchId}`);
  });

  it('adopts the login and display name Twitch sent', async () => {
    await refreshChatterName(twitchId, `new_${twitchId}`, `New_${twitchId}`, log);
    expect(await read(userId)).toEqual({
      login: `new_${twitchId}`,
      displayName: `New_${twitchId}`,
    });
  });

  // The throttle is the whole reason this is affordable on a busy channel: one look-up an hour per
  // chatter, not one per message. Proven by moving the row underneath and seeing it left alone.
  it('checks a chatter at most once an hour', async () => {
    await refreshChatterName(twitchId, `new_${twitchId}`, `New_${twitchId}`, log);
    await db.update(users).set({ displayName: 'Untouched' }).where(eq(users.id, userId));
    await refreshChatterName(twitchId, `newer_${twitchId}`, `Newer_${twitchId}`, log);
    expect((await read(userId)).displayName).toBe('Untouched');
  });

  // Signed up with Google, linked Twitch: the profile belongs to Google, exactly as the OAuth
  // callback decides. There is no `twitch:<id>` row to find, and nothing else may be touched.
  it('leaves an account whose Twitch is only a linked identity alone', async () => {
    const googleId = `google:${crypto.randomUUID()}`;
    await insert(googleId, `g_${twitchId}`, 'Google Name');
    const other = `${Math.floor(Math.random() * 1e9)}`;
    await refreshChatterName(other, `taken_${other}`, `Taken_${other}`, log);
    expect(await read(googleId)).toEqual({ login: `g_${twitchId}`, displayName: 'Google Name' });
  });

  // A freed login gets claimed fast, and `users.login` is UNIQUE — the pair write fails as a whole.
  // The name people actually read must survive that.
  it('keeps the display name when the new login is already taken', async () => {
    const squatter = `sq_${crypto.randomUUID()}`;
    const takenLogin = `taken_${twitchId}`;
    await insert(squatter, takenLogin, 'Squatter');
    await refreshChatterName(twitchId, takenLogin, 'Renamed', log);
    expect(await read(userId)).toEqual({ login: `old_${twitchId}`, displayName: 'Renamed' });
    expect((await read(squatter)).login).toBe(takenLogin);
  });

  it('writes nothing when the names already match', async () => {
    const before = await read(userId);
    await refreshChatterName(twitchId, before.login, before.displayName, log);
    expect(await read(userId)).toEqual(before);
  });
});
