import type { FastifyInstance } from 'fastify';
import { GIFT, type GiftTarget } from '@tmw/shared';
import { requireUser } from '../auth';
import { findGiftTargets, giftDust } from '../gift';

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
      return findGiftTargets(req.query.q ?? '', me.id);
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
