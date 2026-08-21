import { and, eq, gte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  COSMETICS,
  cosmeticModule,
  isCosmeticOfType,
  isBreadthMetric,
  isHexColor,
  breadthProgress,
  type CosmeticEarn,
  type CosmeticStateResponse,
  type EquippedCosmetics,
} from '@tmw/shared';
import { db } from '../db/index';
import { userCosmetics, users } from '../db/schema';
import { isAdmin, requireUser } from '../auth';
import {
  breadthFor,
  dustEarnedFor,
  dustSpentFor,
  messagesTotalFor,
  submissionsTotalFor,
  watchMinutesTotalFor,
} from '../level';

/** Whether the user owns a given catalog item. */
async function owns(userId: string, itemId: string): Promise<boolean> {
  const row = await db
    .select({ itemId: userCosmetics.itemId })
    .from(userCosmetics)
    .where(and(eq(userCosmetics.userId, userId), eq(userCosmetics.itemId, itemId)))
    .get();
  return !!row;
}

/** Live progress toward an earn milestone: channels for a breadth metric, the total otherwise. */
async function earnProgress(userId: string, earn: CosmeticEarn): Promise<number> {
  return isBreadthMetric(earn.metric)
    ? breadthProgress(earn, await breadthFor(userId))
    : earnTotal(userId, earn.metric);
}

/** Live total for an earn metric (summed across channels/identities). */
function earnTotal(userId: string, metric: CosmeticEarn['metric']): Promise<number> {
  return metric === 'watchMinutes'
    ? watchMinutesTotalFor(userId)
    : metric === 'submissions'
      ? submissionsTotalFor(userId)
      : metric === 'dustEarned'
        ? dustEarnedFor(userId)
        : metric === 'dustSpent'
          ? dustSpentFor(userId)
          : messagesTotalFor(userId);
}

/**
 * Whether the user may USE an item — meets its earn milestone (live) if earned, else owns it.
 * Admins (ADMIN_USER_IDS) may equip the whole catalog: they have to look at every cosmetic on real
 * surfaces to judge it, and grinding each threshold on the live account is not a way to do that.
 * The bypass is USE-only — the buy route still charges, so no grant is ever written for free.
 */
async function unlocked(userId: string, itemId: string): Promise<boolean> {
  const item = COSMETICS.find((c) => c.id === itemId);
  if (!item) return false;
  if (isAdmin(userId)) return true;
  // Not obtainable yet — in the catalog only so surfaces can render it (see CosmeticItem.draft).
  if (item.draft) return false;
  return item.earn
    ? (await earnProgress(userId, item.earn)) >= item.earn.count
    : owns(userId, itemId);
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
    // a direct request could buy an upgrade that no surface can render. UNLOCKED, not owned: an
    // earned base (the runner frames) has no ownership row at all, so an owns() gate would make its
    // colour upgrade unbuyable forever. What the upgrade needs is that the base is usable.
    if (item.requires && !(await unlocked(user.id, item.requires))) {
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
      // paidDust freezes the price this purchase actually cost — the 'dustSpent' axis sums it, so a
      // later catalog price edit can't move a threshold someone already passed.
      .values({ userId: user.id, itemId: item.id, paidDust: item.costDust, createdAt: new Date() })
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
      cardEffectColors?: unknown;
      cardEffectColors2?: unknown;
      frameColors?: unknown;
      frame?: unknown;
      seal?: unknown;
      sealColors?: unknown;
      entrance?: unknown;
      entranceColor?: unknown;
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
      ['entranceColor', 'entrance-portal-color'],
    ] as const) {
      if (!(field in body)) continue;
      const raw = body[field];
      if (raw === null) {
        delete equipped[field];
      } else if (typeof raw === 'string' && isHexColor(raw)) {
        if (!(await unlocked(user.id, itemId))) {
          return reply.code(403).send({ error: 'Предмет не куплен' });
        }
        equipped[field] = raw.toLowerCase();
      } else {
        return reply.code(400).send({ error: 'Некорректный цвет' });
      }
    }

    // Per-effect card colours: a partial { effectId: '#rrggbb' | null } map. Each effect has its own
    // colour upgrade, so a set is gated on owning THAT effect's upgrade (see CardEffectModule.colorUpgrade).
    if ('cardEffectColors' in body) {
      const raw = body.cardEffectColors;
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return reply.code(400).send({ error: 'Некорректный цвет' });
      }
      const next: Record<string, string> = { ...(equipped.cardEffectColors ?? {}) };
      for (const [effectId, value] of Object.entries(raw as Record<string, unknown>)) {
        const mod = cosmeticModule(effectId);
        if (mod?.type !== 'card_effect' || !mod.colorUpgrade) {
          return reply.code(400).send({ error: 'Некорректный эффект' });
        }
        if (value === null) {
          delete next[effectId];
        } else if (typeof value === 'string' && isHexColor(value)) {
          if (!(await unlocked(user.id, mod.colorUpgrade))) {
            return reply.code(403).send({ error: 'Предмет не куплен' });
          }
          next[effectId] = value.toLowerCase();
        } else {
          return reply.code(400).send({ error: 'Некорректный цвет' });
        }
      }
      equipped.cardEffectColors = next;
    }

    // The SECOND colour of a two-sided effect (the duel's blades, the portal pair). Same map shape and
    // the same gate — one upgrade unlocks both pickers — plus the effect must actually declare
    // `dualColor`, so a second colour can never be parked on an effect that has nowhere to paint it.
    if ('cardEffectColors2' in body) {
      const raw = body.cardEffectColors2;
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return reply.code(400).send({ error: 'Некорректный цвет' });
      }
      const next: Record<string, string> = { ...(equipped.cardEffectColors2 ?? {}) };
      for (const [effectId, value] of Object.entries(raw as Record<string, unknown>)) {
        const mod = cosmeticModule(effectId);
        if (mod?.type !== 'card_effect' || !mod.colorUpgrade) {
          return reply.code(400).send({ error: 'Некорректный эффект' });
        }
        if (value === null) {
          // A CLEAR is allowed on any colourable effect, `dualColor` or not. Reset sends both maps in
          // one request (one write, or the second call clobbers the first), so gating the clear on
          // dualColor rejected the whole request for every single-colour effect — the colour could be
          // set and never taken off. Nothing is being parked here; the key is being removed.
          delete next[effectId];
        } else if (!mod.dualColor) {
          return reply.code(400).send({ error: 'Некорректный эффект' });
        } else if (typeof value === 'string' && isHexColor(value)) {
          if (!(await unlocked(user.id, mod.colorUpgrade))) {
            return reply.code(403).send({ error: 'Предмет не куплен' });
          }
          next[effectId] = value.toLowerCase();
        } else {
          return reply.code(400).send({ error: 'Некорректный цвет' });
        }
      }
      equipped.cardEffectColors2 = next;
    }

    // Per-frame tints: a partial { frameId: '#rrggbb' | null } map, mirroring cardEffectColors. Each
    // colourable frame has its own BOUGHT upgrade (see FrameModule.colorUpgrade) even though the frame
    // itself is earned, so a set is gated on owning that upgrade; a clear is always allowed.
    if ('frameColors' in body) {
      const raw = body.frameColors;
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return reply.code(400).send({ error: 'Некорректный цвет' });
      }
      const next: Record<string, string> = { ...(equipped.frameColors ?? {}) };
      for (const [frameId, value] of Object.entries(raw as Record<string, unknown>)) {
        const mod = cosmeticModule(frameId);
        if (mod?.type !== 'frame' || !mod.colorUpgrade) {
          return reply.code(400).send({ error: 'Некорректная рамка' });
        }
        if (value === null) {
          delete next[frameId];
        } else if (typeof value === 'string' && isHexColor(value)) {
          if (!(await unlocked(user.id, mod.colorUpgrade))) {
            return reply.code(403).send({ error: 'Предмет не куплен' });
          }
          next[frameId] = value.toLowerCase();
        } else {
          return reply.code(400).send({ error: 'Некорректный цвет' });
        }
      }
      equipped.frameColors = next;
    }

    // Per-seal colours: a partial { sealId: '#rrggbb' | null } map, mirroring cardEffectColors. Each
    // colourable seal has its own EARNED colour upgrade, so a set is gated on that upgrade's milestone
    // being met (live), not on ownership (see SealModule.colorUpgrade).
    if ('sealColors' in body) {
      const raw = body.sealColors;
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
        return reply.code(400).send({ error: 'Некорректный цвет' });
      }
      const next: Record<string, string> = { ...(equipped.sealColors ?? {}) };
      for (const [sealId, value] of Object.entries(raw as Record<string, unknown>)) {
        const mod = cosmeticModule(sealId);
        if (mod?.type !== 'seal' || !mod.colorUpgrade) {
          return reply.code(400).send({ error: 'Некорректная печать' });
        }
        if (value === null) {
          delete next[sealId];
        } else if (typeof value === 'string' && isHexColor(value)) {
          if (!(await unlocked(user.id, mod.colorUpgrade))) {
            return reply.code(403).send({ error: 'Апгрейд ещё не открыт' });
          }
          next[sealId] = value.toLowerCase();
        } else {
          return reply.code(400).send({ error: 'Некорректный цвет' });
        }
      }
      equipped.sealColors = next;
    }

    if ('nickFlow' in body) {
      const raw = body.nickFlow;
      if (raw === null || raw === false) {
        delete equipped.nickFlow;
      } else if (raw === true) {
        if (!(await unlocked(user.id, 'nick-flow'))) {
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
      ['frame', 'frame'],
      ['seal', 'seal'],
      ['entrance', 'entrance'],
    ] as const) {
      if (!(field in body)) continue;
      const raw = body[field];
      if (raw === null) {
        delete equipped[field];
      } else if (
        typeof raw === 'string' &&
        isCosmeticOfType(raw, type) &&
        // An upgrade (e.g. 'entrance-portal-color') is bought but never equipped as its category — it
        // renders nothing, so equipping it would blank the slot.
        !COSMETICS.find((c) => c.id === raw)?.upgrade
      ) {
        // Earned cosmetics (frames, seals) gate on the live activity count, not ownership; everything
        // else must be bought. The gate is live, so anyone past the milestone qualifies right now.
        if (!(await unlocked(user.id, raw))) {
          const earned = !!COSMETICS.find((c) => c.id === raw)?.earn;
          return reply
            .code(403)
            .send({ error: earned ? 'Достижение ещё не выполнено' : 'Эффект не куплен' });
        }
        equipped[field] = raw;
      } else {
        return reply.code(400).send({ error: 'Некорректный эффект' });
      }
    }

    // The portal colour PERSISTS across entrance changes (unlike the nick ladder, which is rendered
    // straight from the equipped state): the render already ignores it unless the portal is equipped
    // (see marksFromEquipped / the chat overlay), so a stored-but-inactive tint is harmless and means
    // the viewer's colour survives switching to another entrance and back. Owning it already requires
    // the portal, so it can never be an orphan.

    await db.update(users).set({ equipped }).where(eq(users.id, user.id));
    return cosmeticState(user.id);
  });
}
