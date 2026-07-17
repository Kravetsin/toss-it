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
    // Free items (e.g. base TTS voices) are available to everyone — nothing to buy.
    if (item.costDust <= 0) return reply.code(400).send({ error: 'Предмет бесплатный' });
    // Ladder items must be bought in order: the shop only hides the later rungs, so without this
    // a direct request could buy an upgrade that no surface can render.
    if (item.requires && !(await owns(user.id, item.requires))) {
      return reply.code(400).send({ error: 'Сначала нужен предыдущий предмет' });
    }

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
   * nickColor2: the gradient's second stop (requires owning 'nick-gradient'). nickEffect /
   * cardEffect / entrance: an item id of that category (requires owning it). null on any of them
   * unequips that slot.
   */
  app.post<{
    Body: {
      nickColor?: unknown;
      nickColor2?: unknown;
      nickFlow?: unknown;
      nickEffect?: unknown;
      cardEffect?: unknown;
      entrance?: unknown;
    } | null;
  }>('/api/cosmetics/equip', async (req, reply) => {
    const user = await requireUser(req, reply);
    if (!user) return;
    // Body is unvalidated at runtime; a primitive body ("x", 5) would throw on `in`.
    const body =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const equipped: EquippedCosmetics = { ...(user.equipped ?? {}) };

    for (const [field, itemId] of [
      ['nickColor', 'nick-color'],
      ['nickColor2', 'nick-gradient'],
    ] as const) {
      if (!(field in body)) continue;
      const raw = body[field];
      if (raw === null) {
        delete equipped[field];
      } else if (typeof raw === 'string' && isHexColor(raw)) {
        if (!(await owns(user.id, itemId))) {
          return reply.code(403).send({ error: 'Предмет не куплен' });
        }
        equipped[field] = raw.toLowerCase();
      } else {
        return reply.code(400).send({ error: 'Некорректный цвет' });
      }
    }

    if ('nickFlow' in body) {
      const raw = body.nickFlow;
      if (raw === null || raw === false) {
        delete equipped.nickFlow;
      } else if (raw === true) {
        if (!(await owns(user.id, 'nick-flow'))) {
          return reply.code(403).send({ error: 'Предмет не куплен' });
        }
        equipped.nickFlow = true;
      } else {
        return reply.code(400).send({ error: 'Некорректное значение' });
      }
    }

    // The colour family is a ladder: a second stop has nothing to ramp from without the base, and
    // flow has nothing to drift between without the second stop. Drop the upgrades with their
    // foundation rather than persisting a state no surface can render.
    if (!equipped.nickColor) delete equipped.nickColor2;
    if (!equipped.nickColor2) delete equipped.nickFlow;

    // One slot per category; null unequips it. A table rather than a branch per field, so a new
    // category is a line here and nothing else.
    for (const [field, type] of [
      ['nickEffect', 'nick_effect'],
      ['cardEffect', 'card_effect'],
      ['entrance', 'entrance'],
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
  });
}
