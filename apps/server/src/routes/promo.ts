import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { PromoRedeemResult } from '@tmw/shared';
import { db } from '../db/index';
import { promoCodes, promoRedemptions, users } from '../db/schema';
import type { PromoCodeRow } from '../db/schema';
import { requireUser } from '../auth';

/** Promo codes are case-insensitive; normalize to uppercase. */
const normalize = (code: string) => code.trim().toUpperCase();

interface GrantHandler {
  /** Code prefix, so an issued code reads as its type. */
  prefix: string;
  /** Whether grantAmount is required when issuing (and meaningful on redeem). */
  needsAmount: boolean;
  apply: (userId: string, code: PromoCodeRow) => Promise<void>;
}

/** Grant-type registry: add a new type via one entry; effect applies to redeemer. */
const GRANT_HANDLERS: Record<string, GrantHandler> = {
  founder: {
    prefix: 'FND',
    needsAmount: false,
    // Never downgrade: only set if user is not already a founder.
    apply: async (userId) => {
      await db
        .update(users)
        .set({ founderSince: new Date() })
        .where(and(eq(users.id, userId), isNull(users.founderSince)));
    },
  },
  stardust: {
    prefix: 'DUST',
    needsAmount: true,
    apply: async (userId, code) => {
      await db
        .update(users)
        .set({ stardust: sql`${users.stardust} + ${code.grantAmount ?? 0}` })
        .where(eq(users.id, userId));
    },
  },
};

/** Whether a grant type exists (validation when issuing codes). */
export function isKnownGrant(grant: string): boolean {
  return grant in GRANT_HANDLERS;
}

export function grantNeedsAmount(grant: string): boolean {
  return GRANT_HANDLERS[grant]?.needsAmount ?? false;
}

export function grantPrefix(grant: string): string {
  return GRANT_HANDLERS[grant]?.prefix ?? 'FND';
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
        return reply.code(410).send({ error: 'Промокод больше не действует' });
      }
      const handler = GRANT_HANDLERS[row.grant];
      if (!handler) {
        // Grant type no longer supported: don't redeem, to avoid burning a use.
        return reply.code(400).send({ error: 'Этот тип промокода больше не поддерживается' });
      }

      // No transactions in this repo, so order matters: record the redemption FIRST (its PK is
      // the per-user guard), then claim a seat. Overshooting maxUses would hand out real
      // currency, so a crash between the two must leave a seat unclaimed, never over-claimed.
      const mine = await db
        .insert(promoRedemptions)
        .values({ code, userId: user.id, createdAt: new Date() })
        .onConflictDoNothing();
      if (mine.rowsAffected === 0) {
        return reply.code(409).send({ error: 'Вы уже активировали этот промокод' });
      }

      const claim = await db
        .update(promoCodes)
        .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
        .where(and(eq(promoCodes.code, code), lt(promoCodes.usedCount, promoCodes.maxUses)));
      if (claim.rowsAffected === 0) {
        await db
          .delete(promoRedemptions)
          .where(and(eq(promoRedemptions.code, code), eq(promoRedemptions.userId, user.id)));
        return reply.code(409).send({ error: 'Промокод исчерпан' });
      }

      await handler.apply(user.id, row);
      return { ok: true, grant: row.grant, amount: row.grantAmount };
    },
  );
}
