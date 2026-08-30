import crypto from 'node:crypto';
import { and, desc, eq, gte, isNull, isNotNull, sql } from 'drizzle-orm';
import {
  BET,
  BET_COOLDOWN_MS,
  colorOfSlot,
  maxBet,
  payoutFor,
  ROULETTE_SLOTS,
  type RouletteColor,
} from '@tmw/shared';
import { db } from './db/index';
import { linkedIdentities, pendingDust, rouletteSeeds, rouletteSpins, users } from './db/schema';

/**
 * The dust wheel's engine, shared by both doors (the `!bet` chat command and the site) so neither
 * can become the cheap way past the other's limits — the same reasoning behind submitLimits.
 *
 * Money rules, in order of how badly they break things if ignored:
 *  - The stake is taken with a guarded UPDATE before the wheel is consulted. There are no
 *    transactions in this repo, so operations are ordered instead: debit, spin, credit. A crash
 *    between them costs the player their stake and never the house — and there is no house
 *    bankroll to lose anyway, since we mint and burn dust ourselves.
 *  - A payout moves `stardust` only, never `dustEarned`. Winnings are not contribution, and the
 *    wealth cosmetics read the latter (see creditDust, which is deliberately not used here).
 *  - An unregistered chatter plays out of the dust we are holding for them, and CAN lose it.
 *    Risk-free spins would make "never register" the dominant strategy.
 */

/** Spins before a seed is retired and revealed. Deliberately a count, not a schedule: we have no
 *  trustworthy "the stream ended" signal, and a chain that rotates on nothing is unverifiable. */
const ROTATE_AFTER = 1000;

export interface BetInput {
  /** Null when placed on the site, which belongs to no channel. */
  channelId: string | null;
  platform: string;
  platformUserId: string;
  /** Known when the better has an account; null routes the money through pending_dust. */
  userId: string | null;
  stake: number;
  color: RouletteColor;
}

export type BetOutcome =
  | { kind: 'cooldown'; waitS: number }
  | { kind: 'tooSmall'; min: number }
  | { kind: 'overCap'; max: number; balance: number }
  /** Cannot play at all: the balance is under the floor. `registered` drives the sign-up nudge. */
  | { kind: 'broke'; balance: number; registered: boolean }
  | {
      kind: 'done';
      stake: number;
      betColor: RouletteColor;
      slot: number;
      resultColor: RouletteColor;
      /** Total returned, stake included; 0 = lost. */
      payout: number;
      balance: number;
    };

/** Last spin per player, for the shared cooldown. In memory on purpose: a restart forgiving a 60s
 *  wait is not worth a write per bet. */
const lastBetAt = new Map<string, number>();

/** One key per PERSON, not per door — an account and its twitch id must share the cooldown. */
function cooldownKey(input: BetInput): string {
  return input.userId ?? `${input.platform}:${input.platformUserId}`;
}

/** Serializes seed creation. Every seed gets its own hash, so a PK conflict can't dedupe two racing
 *  creations — without this, a channel could end up with two live chains and rotation retiring one
 *  of them. A single in-process guard is enough because the server is one process. */
let creatingSeed: Promise<{ seedHash: string; seed: string }> | null = null;

/** The live seed, creating the first one on demand. Rotation happens after a spin, not here, so a
 *  bet never waits on it. */
async function liveSeed(): Promise<{ seedHash: string; seed: string }> {
  const row = await db
    .select({ seedHash: rouletteSeeds.seedHash, seed: rouletteSeeds.seed })
    .from(rouletteSeeds)
    .where(isNull(rouletteSeeds.revealedAt))
    .get();
  if (row?.seed) return { seedHash: row.seedHash, seed: row.seed };

  creatingSeed ??= (async () => {
    const seed = crypto.randomBytes(32).toString('hex');
    const seedHash = crypto.createHash('sha256').update(seed).digest('hex');
    await db.insert(rouletteSeeds).values({ seedHash, seed, nonce: 0, createdAt: new Date() });
    return { seedHash, seed };
  })().finally(() => {
    creatingSeed = null;
  });
  return creatingSeed;
}

/** The slot a seed produces at this nonce. Pure, so anyone holding a revealed seed can recompute
 *  every spin it ever made — which is the whole point of publishing the hash first. */
export function slotFor(seed: string, nonce: number): number {
  const mac = crypto.createHmac('sha256', seed).update(String(nonce)).digest();
  return mac.readUInt32BE(0) % ROULETTE_SLOTS;
}

/** Claim the next nonce atomically; concurrent bets can then never share a slot by accident. */
async function nextNonce(seedHash: string): Promise<number | null> {
  const rows = await db
    .update(rouletteSeeds)
    .set({ nonce: sql`${rouletteSeeds.nonce} + 1` })
    .where(and(eq(rouletteSeeds.seedHash, seedHash), isNull(rouletteSeeds.revealedAt)))
    .returning({ nonce: rouletteSeeds.nonce });
  return rows[0]?.nonce ?? null;
}

/** Current balance and whether it lives on an account (as opposed to pending_dust). */
async function readBalance(
  input: BetInput,
): Promise<{ balance: number; onAccount: boolean; userId: string | null }> {
  const userId = input.userId ?? (await resolveUserId(input.platform, input.platformUserId));
  if (userId) {
    const row = await db
      .select({ dust: users.stardust })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    return { balance: row?.dust ?? 0, onAccount: true, userId };
  }
  const row = await db
    .select({ amount: pendingDust.amount })
    .from(pendingDust)
    .where(
      and(
        eq(pendingDust.platform, input.platform),
        eq(pendingDust.platformUserId, input.platformUserId),
      ),
    )
    .get();
  return { balance: row?.amount ?? 0, onAccount: false, userId: null };
}

async function resolveUserId(platform: string, platformUserId: string): Promise<string | null> {
  const row = await db
    .select({ userId: linkedIdentities.userId })
    .from(linkedIdentities)
    .where(
      and(eq(linkedIdentities.provider, platform), eq(linkedIdentities.providerId, platformUserId)),
    )
    .get();
  return row?.userId ?? null;
}

/** Guarded debit; false = the balance moved under us and the bet must not happen. */
async function debit(input: BetInput, userId: string | null, amount: number): Promise<boolean> {
  if (userId) {
    const res = await db
      .update(users)
      .set({ stardust: sql`${users.stardust} - ${amount}` })
      .where(and(eq(users.id, userId), gte(users.stardust, amount)));
    return res.rowsAffected > 0;
  }
  const res = await db
    .update(pendingDust)
    .set({ amount: sql`${pendingDust.amount} - ${amount}`, updatedAt: new Date() })
    .where(
      and(
        eq(pendingDust.platform, input.platform),
        eq(pendingDust.platformUserId, input.platformUserId),
        gte(pendingDust.amount, amount),
      ),
    );
  return res.rowsAffected > 0;
}

/** Balance only — a payout is not contribution, so `dustEarned` must not move. */
async function credit(input: BetInput, userId: string | null, amount: number): Promise<void> {
  if (amount <= 0) return;
  if (userId) {
    await db
      .update(users)
      .set({ stardust: sql`${users.stardust} + ${amount}` })
      .where(eq(users.id, userId));
    return;
  }
  await db
    .update(pendingDust)
    .set({ amount: sql`${pendingDust.amount} + ${amount}`, updatedAt: new Date() })
    .where(
      and(
        eq(pendingDust.platform, input.platform),
        eq(pendingDust.platformUserId, input.platformUserId),
      ),
    );
}

export async function placeBet(input: BetInput): Promise<BetOutcome> {
  const key = cooldownKey(input);
  const since = Date.now() - (lastBetAt.get(key) ?? 0);
  if (since < BET_COOLDOWN_MS) {
    return { kind: 'cooldown', waitS: Math.ceil((BET_COOLDOWN_MS - since) / 1000) };
  }

  const { balance, onAccount, userId } = await readBalance(input);
  const cap = maxBet(balance);
  if (cap === 0) return { kind: 'broke', balance, registered: onAccount };
  if (input.stake < BET.min) return { kind: 'tooSmall', min: BET.min };
  if (input.stake > cap) return { kind: 'overCap', max: cap, balance };

  if (!(await debit(input, userId, input.stake))) {
    // Something else spent it between the read and the charge — report the fresh truth.
    const fresh = await readBalance(input);
    return { kind: 'broke', balance: fresh.balance, registered: fresh.onAccount };
  }
  // Only now, once the stake is actually taken: a rejected bet must not burn a cooldown or a nonce.
  lastBetAt.set(key, Date.now());

  const { seedHash, seed } = await liveSeed();
  const nonce = await nextNonce(seedHash);
  if (nonce === null) {
    // The seed rotated out from under us — refund rather than spin against a revealed seed.
    await credit(input, userId, input.stake);
    lastBetAt.delete(key);
    return { kind: 'broke', balance, registered: onAccount };
  }

  const slot = slotFor(seed, nonce);
  const payout = payoutFor(input.color, slot, input.stake);
  await credit(input, userId, payout);

  await db.insert(rouletteSpins).values({
    channelId: input.channelId,
    platform: input.platform,
    platformUserId: input.platformUserId,
    userId,
    stake: input.stake,
    betColor: input.color,
    slot,
    payout,
    seedHash,
    nonce,
    createdAt: new Date(),
  });

  if (nonce >= ROTATE_AFTER) await rotateSeed(seedHash);

  return {
    kind: 'done',
    stake: input.stake,
    betColor: input.color,
    slot,
    resultColor: colorOfSlot(slot),
    payout,
    balance: balance - input.stake + payout,
  };
}

/** Retire a seed and publish it, so every spin it produced becomes checkable. */
async function rotateSeed(seedHash: string): Promise<void> {
  await db
    .update(rouletteSeeds)
    .set({ revealedAt: new Date() })
    .where(and(eq(rouletteSeeds.seedHash, seedHash), isNull(rouletteSeeds.revealedAt)));
}

export interface Fairness {
  /** Hash of the seed spinning right now — published before it is used. */
  currentHash: string;
  /** The most recently retired seed, with which its spins can be recomputed. */
  revealedSeed: string | null;
  revealedHash: string | null;
}

export async function fairness(): Promise<Fairness> {
  const { seedHash } = await liveSeed();
  const last = await db
    .select({ seedHash: rouletteSeeds.seedHash, seed: rouletteSeeds.seed })
    .from(rouletteSeeds)
    .where(isNotNull(rouletteSeeds.revealedAt))
    .orderBy(desc(rouletteSeeds.revealedAt))
    .get();
  return {
    currentHash: seedHash,
    revealedSeed: last?.seed ?? null,
    revealedHash: last?.seedHash ?? null,
  };
}

/** Balance + what this player may stake right now, for the site panel and a bare `!bet`. */
export async function betState(
  input: Pick<BetInput, 'platform' | 'platformUserId' | 'userId'>,
): Promise<{ balance: number; max: number; registered: boolean }> {
  const { balance, onAccount } = await readBalance({
    ...input,
    channelId: null,
    stake: 0,
    color: 'red',
  });
  return { balance, max: maxBet(balance), registered: onAccount };
}
