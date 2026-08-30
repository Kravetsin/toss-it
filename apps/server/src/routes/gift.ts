import { and, like, ne, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { GIFT, type GiftTarget } from '@tmw/shared';
import { db } from '../db/index';
import { users } from '../db/schema';
import { requireUser } from '../auth';
import { giftDust } from '../gift';

/** Enough to pick someone out, few enough that the list stays a list. */
const SEARCH_LIMIT = 6;
/** Below this a query matches half the site and means nothing. */
const SEARCH_MIN = 2;

/**
 * Giving dust from the site.
 *
 * The recipient is SEARCHED and then PICKED, never typed into the request. A free-text name field
 * is the one shape this must not have: there is no autocomplete to save you, gifts cannot be taken
 * back, and one wrong character sends someone's dust to a stranger with a similar name.
 *
 * Search is a PREFIX match, not a substring one. It finds the person you already know the name of,
 * which is the only case this serves, and it is useless for walking the user table.
 */
export function registerGiftRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { q?: string } }>(
    '/api/users/search',
    async (req, reply): Promise<GiftTarget[] | undefined> => {
      const me = await requireUser(req, reply);
      if (!me) return;
      const q = (req.query.q ?? '').trim().toLowerCase();
      if (q.length < SEARCH_MIN) return [];
      const prefix = `${q}%`;
      const rows = await db
        .select({
          userId: users.id,
          login: users.login,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(
          and(
            or(like(users.login, prefix), like(sql`lower(${users.displayName})`, prefix)),
            // Never offer the giver themselves: the refusal would come after they had picked.
            ne(users.id, me.id),
          ),
        )
        .limit(SEARCH_LIMIT)
        .all();
      return rows;
    },
  );

  app.post<{ Body: { userId?: string; amount?: number } }>('/api/dust/gift', async (req, reply) => {
    const me = await requireUser(req, reply);
    if (!me) return;
    const userId = String(req.body?.userId ?? '');
    const amount = Number(req.body?.amount);
    if (!userId || !Number.isInteger(amount) || amount < GIFT.min) {
      return reply.code(400).send({ error: `Минимальный подарок ${GIFT.min}` });
    }
    const res = await giftDust({ fromUserId: me.id, to: { userId }, amount });
    if (res.kind === 'done') return res;
    return reply.code(400).send({ error: res.kind });
  });
}
