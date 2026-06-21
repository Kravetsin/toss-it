import { and, eq, gte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  COSMETICS,
  isHexColor,
  type CosmeticStateResponse,
  type EquippedCosmetics,
} from '@tmw/shared';
import { db } from '../db/index';
import { userCosmetics, users } from '../db/schema';
import { requireUser } from '../auth';

/** Current cosmetic state of a user (balance + owned + equipped). */
async function cosmeticState(userId: string): Promise<CosmeticStateResponse> {
  const u = await db
    .select({ stardust: users.stardust, equipped: users.equipped })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  const owned = await db
    .select({ itemId: userCosmetics.itemId })
    .from(userCosmetics)
    .where(eq(userCosmetics.userId, userId))
    .all();
  return {
    stardust: u?.stardust ?? 0,
    ownedCosmetics: owned.map((o) => o.itemId),
    equipped: u?.equipped ?? {},
  };
}

export function registerCosmeticsRoutes(app: FastifyInstance): void {
  /** Buy a cosmetic with stardust. Cosmetics are never bought with money. */
  app.post<{ Body: { itemId?: unknown } | null }>('/api/cosmetics/buy', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const itemId = typeof req.body?.itemId === 'string' ? req.body.itemId : '';
    const item = COSMETICS.find((c) => c.id === itemId);
    if (!item) return reply.code(400).send({ error: 'Неизвестный предмет' });

    // Charge FIRST with an atomic balance guard. A grant must never exist without a paid
    // debit: otherwise a concurrent equip could lock in a color for free during a rollback
    // window (TOCTOU). No transactions in this repo, so we order operations to be safe.
    const charged = await db
      .update(users)
      .set({ stardust: sql`${users.stardust} - ${item.costDust}` })
      .where(and(eq(users.id, user.id), gte(users.stardust, item.costDust)));
    if (charged.rowsAffected === 0) {
      return reply.code(400).send({ error: 'Недостаточно звёздной пыли' });
    }

    // Grant; a PK conflict means already owned (double-click / double-charge) — refund this debit.
    const granted = await db
      .insert(userCosmetics)
      .values({ userId: user.id, itemId: item.id, createdAt: new Date() })
      .onConflictDoNothing();
    if (granted.rowsAffected === 0) {
      await db
        .update(users)
        .set({ stardust: sql`${users.stardust} + ${item.costDust}` })
        .where(eq(users.id, user.id));
      return reply.code(409).send({ error: 'Уже куплено' });
    }

    return cosmeticState(user.id);
  });

  /** Equip/unequip cosmetics. nickColor: free-form #rrggbb (requires owning 'nick-color'); null unequips. */
  app.post<{ Body: { nickColor?: unknown } | null }>('/api/cosmetics/equip', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    // Body is unvalidated at runtime; a primitive body ("x", 5) would throw on `in`.
    const body =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? (req.body as { nickColor?: unknown })
        : {};
    const equipped: EquippedCosmetics = { ...(user.equipped ?? {}) };

    if ('nickColor' in body) {
      const raw = body.nickColor;
      if (raw === null) {
        delete equipped.nickColor;
      } else if (typeof raw === 'string' && isHexColor(raw)) {
        const owns = await db
          .select({ itemId: userCosmetics.itemId })
          .from(userCosmetics)
          .where(and(eq(userCosmetics.userId, user.id), eq(userCosmetics.itemId, 'nick-color')))
          .get();
        if (!owns) return reply.code(403).send({ error: 'Цвет ника не куплен' });
        equipped.nickColor = raw.toLowerCase();
      } else {
        return reply.code(400).send({ error: 'Некорректный цвет' });
      }
    }

    await db.update(users).set({ equipped }).where(eq(users.id, user.id));
    return cosmeticState(user.id);
  });
}
