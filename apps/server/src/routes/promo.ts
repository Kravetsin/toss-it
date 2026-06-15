import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { PromoRedeemResult } from '@tmw/shared';
import { db } from '../db/index';
import { promoCodes, users } from '../db/schema';
import { requireUser } from '../auth';

/** Промокоды нечувствительны к регистру — нормализуем к верхнему. */
const normalize = (code: string) => code.trim().toUpperCase();

/**
 * Реестр типов грантов. Чтобы добавить новый тип (например, скидку) —
 * достаточно одной записи здесь: эффект применяется к погасившему пользователю.
 */
const GRANT_HANDLERS: Record<string, { apply: (userId: string) => Promise<void> }> = {
  founder: {
    // Статус не понижаем — выставляем только если пользователь ещё не первопроходец.
    apply: async (userId) => {
      await db
        .update(users)
        .set({ founderSince: new Date() })
        .where(and(eq(users.id, userId), isNull(users.founderSince)));
    },
  },
};

/** Известен ли тип гранта (для валидации при выпуске кодов). */
export function isKnownGrant(grant: string): boolean {
  return grant in GRANT_HANDLERS;
}

export function registerPromoRoutes(app: FastifyInstance): void {
  /** Гасит код и применяет грант. Любой залогиненный пользователь. */
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
        // Тип гранта больше не поддерживается — код не гасим, чтобы не сжечь впустую.
        return reply.code(400).send({ error: 'Этот тип промокода больше не поддерживается' });
      }

      // Атомарный «захват»: помечаем код только если он ещё не погашен (защита от гонки/двойного клика).
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
