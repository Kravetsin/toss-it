import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { PromoRedeemResult } from '@tmw/shared';
import { db } from '../db/index';
import { promoCodes, users } from '../db/schema';
import { requireUser } from '../auth';

/** Promo codes are case-insensitive; normalize to uppercase. */
const normalize = (code: string) => code.trim().toUpperCase();

/** Grant-type registry: add a new type via one entry; effect applies to redeemer. */
const GRANT_HANDLERS: Record<string, { apply: (userId: string) => Promise<void> }> = {
  founder: {
    // Never downgrade: only set if user is not already a founder.
    apply: async (userId) => {
      await db
        .update(users)
        .set({ founderSince: new Date() })
        .where(and(eq(users.id, userId), isNull(users.founderSince)));
    },
  },
};

/** Whether a grant type exists (validation when issuing codes). */
export function isKnownGrant(grant: string): boolean {
  return grant in GRANT_HANDLERS;
}

export function registerPromoRoutes(app: FastifyInstance): void {
  /** Redeem a code and apply its grant. Any logged-in user. */
  app.post<{ Params: { code: string } }>(
    '/api/promo/:code/redeem',
    async (req, reply): Promise<PromoRedeemResult | undefined> => {
      const user = await requireUser(req, reply);
      if (!user) return;
      const code = normalize(req.params.code);

      const row = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).get();
      if (!row) return reply.code(404).send({ error: 'Промокод не найден' });
      if (row.expiresAt != null && row.expiresAt.getTime() < Date.now()) {
        return reply.code(410).send({ error: 'Срок действия промокода истёк' });
      }
      const handler = GRANT_HANDLERS[row.grant];
      if (!handler) {
        // Grant type no longer supported: don't redeem, to avoid burning the code.
        return reply.code(400).send({ error: 'Этот тип промокода больше не поддерживается' });
      }

      // Atomic claim: mark only if not yet redeemed (guards against race/double-click).
      const now = new Date();
      const claim = await db
        .update(promoCodes)
        .set({ redeemedByUserId: user.id, redeemedAt: now })
        .where(and(eq(promoCodes.code, code), isNull(promoCodes.redeemedByUserId)));
      if (claim.rowsAffected === 0) {
        return reply.code(409).send({ error: 'Промокод уже использован' });
      }

      await handler.apply(user.id);
      return { ok: true, grant: row.grant };
    },
  );
}
