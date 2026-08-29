import { and, eq, gte, sql } from 'drizzle-orm';
import {
  NAME_CHANGE_DUST,
  checkDisplayName,
  foldForCollision,
  type NameProblem,
} from '@tmw/shared';
import { db } from './db/index';
import { linkedIdentities, nameChanges, users } from './db/schema';

/**
 * Buying a display name. The rules live in @tmw/shared (so the form rejects the same things this
 * does); what is here is the money and the impersonation gate.
 *
 * THE DUST IS CHARGED AT THE RENAME, never sold as a token to spend later. That is not a UI
 * preference: an unspent balance of "name changes" would be the first refundable, holdable thing in
 * the economy, and every dust sink being a permanent non-transferable grant is what lets
 * dustSpentFor be derived by summing rather than counted (see level.ts). A name is permanent in the
 * same sense — it cannot be handed to anyone else — so the invariant survives, provided nothing is
 * ever bought except the change itself.
 */

export type RenameResult =
  | { ok: true; name: string; stardust: number }
  | { ok: false; problem: NameProblem | 'poor' };

/**
 * Every users row that is really THIS person: their own row, plus the rows their other identities
 * point at. Someone who signed up on Twitch and later made Google their primary still has the old
 * `twitch:<id>` row sitting there, carrying their Twitch name — and asking to be called by your own
 * Twitch name is the very thing this item is for, so those rows must never read as somebody else.
 *
 * The identity is the proof of ownership, not the row: a row is only skipped when one of the
 * caller's own linked identities resolves to that exact id, so an identity they gave up (unlinked,
 * then claimed by another person) still counts against them, correctly.
 */
async function selfRowIds(selfId: string): Promise<Set<string>> {
  const ids = new Set([selfId]);
  const rows = await db
    .select({ provider: linkedIdentities.provider, providerId: linkedIdentities.providerId })
    .from(linkedIdentities)
    .where(eq(linkedIdentities.userId, selfId))
    .all();
  for (const r of rows) ids.add(`${r.provider}:${r.providerId}`);
  return ids;
}

/**
 * Names that already belong to a real account, as collision keys. Only PLATFORM names and logins:
 * a custom name is nobody's identity, so two people may share one (see displayName.ts in shared).
 *
 * A full scan, deliberately: the fold has no SQL equivalent, and this runs once per rename attempt
 * — a thousand-dust action, not a keystroke. If the user table ever outgrows that, the fold becomes
 * a stored column with an index on it.
 */
async function isImpersonation(fold: string, selfId: string): Promise<boolean> {
  if (!fold) return false;
  const mine = await selfRowIds(selfId);
  const rows = await db
    .select({ id: users.id, login: users.login, platformName: users.platformName })
    .from(users)
    .all();
  for (const r of rows) {
    if (mine.has(r.id)) continue;
    if (foldForCollision(r.login) === fold) return true;
    if (r.platformName && foldForCollision(r.platformName) === fold) return true;
  }
  return false;
}

/**
 * Validate, charge, rename — in that order, so a rejected name never costs anything. The charge is
 * a conditional UPDATE (the same guard /api/cosmetics/buy uses), and the rename is a second write:
 * if it somehow fails the dust goes back, because a debit with no name is the one outcome nobody
 * could explain.
 */
export async function buyDisplayName(userId: string, raw: string): Promise<RenameResult> {
  const check = checkDisplayName(raw);
  if (!check.ok) return { ok: false, problem: check.problem ?? 'badChars' };
  const name = check.value;
  if (await isImpersonation(foldForCollision(name), userId)) {
    return { ok: false, problem: 'taken' };
  }

  const charged = await db
    .update(users)
    .set({ stardust: sql`${users.stardust} - ${NAME_CHANGE_DUST}` })
    .where(and(eq(users.id, userId), gte(users.stardust, NAME_CHANGE_DUST)));
  if (charged.rowsAffected === 0) return { ok: false, problem: 'poor' };

  const now = new Date();
  try {
    await db
      .update(users)
      .set({ displayName: name, customNameAt: now })
      .where(eq(users.id, userId));
    // The ledger: what this sink contributes to the 'dustSpent' axis, and the history a streamer
    // needs when a name turns abusive.
    await db
      .insert(nameChanges)
      .values({ userId, name, paidDust: NAME_CHANGE_DUST, createdAt: now });
  } catch (err) {
    await db
      .update(users)
      .set({ stardust: sql`${users.stardust} + ${NAME_CHANGE_DUST}` })
      .where(eq(users.id, userId));
    throw err;
  }

  const row = await db
    .select({ stardust: users.stardust })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return { ok: true, name, stardust: row?.stardust ?? 0 };
}

/** Give the provider's name back, free — undoing a purchase is not itself a purchase. */
export async function clearDisplayName(userId: string): Promise<string | null> {
  const row = await db
    .select({ platformName: users.platformName, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) return null;
  const back = row.platformName ?? row.displayName;
  await db.update(users).set({ displayName: back, customNameAt: null }).where(eq(users.id, userId));
  return back;
}

/**
 * Record the provider's current name for an account, and show it too unless a bought name is in
 * the way. Every path that learns a fresh name from a provider goes through here — the OAuth
 * callback and the chat write-back — so "which of the two is displayed" is decided once.
 */
export async function setPlatformName(
  userId: string,
  platformName: string,
  login?: string,
): Promise<void> {
  const row = await db
    .select({ customNameAt: users.customNameAt })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) return;
  await db
    .update(users)
    .set({
      platformName,
      ...(login ? { login } : {}),
      ...(row.customNameAt ? {} : { displayName: platformName }),
    })
    .where(eq(users.id, userId));
}

/** Lifetime dust spent on names — the part of the 'dustSpent' axis user_cosmetics cannot hold. */
export async function dustSpentOnNames(userId: string): Promise<number> {
  const row = await db
    .select({ total: sql<number>`coalesce(sum(${nameChanges.paidDust}), 0)` })
    .from(nameChanges)
    .where(eq(nameChanges.userId, userId))
    .get();
  return row?.total ?? 0;
}
