import crypto from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { WELCOME_DUST } from '@tmw/shared';
import { db } from '../../db/index';
import { users } from '../../db/schema';
import { grantWelcomeDust } from './accrual';

/**
 * The welcome bonus. Free dust granted by a login route, so the only things worth pinning are the
 * two ways it could go wrong in production: paying twice, and quietly counting as earnings.
 */
describe('welcome dust', () => {
  let userId: string;

  const read = async () =>
    (await db
      .select({ stardust: users.stardust, earned: users.dustEarned, at: users.welcomeDustAt })
      .from(users)
      .where(eq(users.id, userId))
      .get())!;

  beforeEach(async () => {
    userId = `u_${crypto.randomUUID()}`;
    await db.insert(users).values({
      id: userId,
      login: userId,
      displayName: userId,
      avatarUrl: null,
      createdAt: new Date(),
    });
  });

  it('pays once and stamps the account', async () => {
    expect(await grantWelcomeDust(userId)).toBe(WELCOME_DUST);
    const row = await read();
    expect(row.stardust).toBe(WELCOME_DUST);
    expect(row.at).not.toBeNull();
  });

  it('pays nothing on a second login', async () => {
    await grantWelcomeDust(userId);
    expect(await grantWelcomeDust(userId)).toBe(0);
    expect((await read()).stardust).toBe(WELCOME_DUST);
  });

  // Two tabs finishing the same first login: the guard lives in the UPDATE, so only one can win.
  it('pays once when two grants race', async () => {
    const [a, b] = await Promise.all([grantWelcomeDust(userId), grantWelcomeDust(userId)]);
    expect([a, b].filter((n) => n > 0)).toHaveLength(1);
    expect((await read()).stardust).toBe(WELCOME_DUST);
  });

  // A grant is not contribution: the wealth cosmetics read dustEarned, and 1000 free dust must not
  // move them (see creditDust, which is deliberately NOT what this uses).
  it('leaves lifetime earned alone', async () => {
    await grantWelcomeDust(userId);
    expect((await read()).earned).toBe(0);
  });
});
