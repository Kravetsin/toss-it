import { and, eq, gte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  COSMETICS,
  isCosmeticOfType,
  isHexColor,
  type CosmeticStateResponse,
  type EquippedCosmetics,
} from '@tmw/shared';
import { db } from '../db/index';
import { userCosmetics, users } from '../db/schema';
import { requireUser } from '../auth';

/** Whether the user owns a given catalog item. */
async function owns(userId: string, itemId: string): Promise<boolean> {
  const row = await db
    .select({ itemId: userCosmetics.itemId })
    .from(userCosmetics)
    .where(and(eq(userCosmetics.userId, userId), eq(userCosmetics.itemId, itemId)))
    .get();
  return !!row;
}

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

  /**
   * Equip/unequip cosmetics. nickColor: free-form #rrggbb (requires owning 'nick-color').
   * nickEffect: a nick-effect item id (requires owning it). null on either unequips that slot.
   */
  app.post<{ Body: { nickColor?: unknown; nickEffect?: unknown; cardEffect?: unknown } | null }>(
    '/api/cosmetics/equip',
    async (req, reply) => {
      const user = await requireUser(req, reply);
      if (!user) return;
      // Body is unvalidated at runtime; a primitive body ("x", 5) would throw on `in`.
      const body =
        req.body && typeof req.body === 'object' && !Array.isArray(req.body)
          ? (req.body as { nickColor?: unknown; nickEffect?: unknown; cardEffect?: unknown })
          : {};
      const equipped: EquippedCosmetics = { ...(user.equipped ?? {}) };

      if ('nickColor' in body) {
        const raw = body.nickColor;
        if (raw === null) {
          delete equipped.nickColor;
        } else if (typeof raw === 'string' && isHexColor(raw)) {
          if (!(await owns(user.id, 'nick-color'))) {
            return reply.code(403).send({ error: 'Цвет ника не куплен' });
          }
          equipped.nickColor = raw.toLowerCase();
        } else {
          return reply.code(400).send({ error: 'Некорректный цвет' });
        }
      }

      // Equip a nick effect (slot) or a card effect (slot). null unequips that slot.
      for (const [field, type] of [
        ['nickEffect', 'nick_effect'],
        ['cardEffect', 'card_effect'],
      ] as const) {
        if (!(field in body)) continue;
        const raw = body[field];
        if (raw === null) {
          delete equipped[field];
        } else if (typeof raw === 'string' && isCosmeticOfType(raw, type)) {
          if (!(await owns(user.id, raw))) {
            return reply.code(403).send({ error: 'Эффект не куплен' });
          }
          equipped[field] = raw;
        } else {
          return reply.code(400).send({ error: 'Некорректный эффект' });
        }
      }

      await db.update(users).set({ equipped }).where(eq(users.id, user.id));
      return cosmeticState(user.id);
    },
  );
}
