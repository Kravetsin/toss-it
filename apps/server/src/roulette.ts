import crypto from 'node:crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import {
  BET,
  colorOfSlot,
  maxBet,
  payoutFor,
  ROULETTE_SLOTS,
  type RouletteColor,
} from '@tmw/shared';
import { db } from './db/index';
import { linkedIdentities, pendingDust, rouletteSpins, users } from './db/schema';

/**
 * The dust wheel's engine, shared by both doors (the `!bet` chat command and the site) so the
 * balance, the cap and the payout can never differ between them.
 *
 * There is NO per-player cooldown. One lived here to protect the bot's Twitch send budget, and it
 * produced exactly the traffic it was meant to prevent: a refusal costs a message just as an answer
 * does, so throttling only converted bets into "too fast, wait 40s". The send budget is defended
 * where it actually lives — SEND_PER_CHANNEL and SEND_GLOBAL in the chat module, which drop the
 * chat copy and still answer on the overlay.
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

/**
 * The lifetime tally, for cosmetics gated on the wheel. Its own UPDATE because `credit` is skipped
 * on a loss, and a loss is exactly half of what this counts.
 */
async function noteSpin(userId: string | null, won: boolean): Promise<void> {
  if (!userId) return;
  const col = won ? users.rouletteWins : users.rouletteLosses;
  await db
    .update(users)
    .set(won ? { rouletteWins: sql`${col} + 1` } : { rouletteLosses: sql`${col} + 1` })
    .where(eq(users.id, userId));
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
  // Identity first: it decides which wallet gets charged.
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

  const slot = crypto.randomInt(ROULETTE_SLOTS);
  const payout = payoutFor(input.color, slot, input.stake);
  await credit(input, userId, payout);
  await noteSpin(userId, payout > 0);

  await db.insert(rouletteSpins).values({
    channelId: input.channelId,
    platform: input.platform,
    platformUserId: input.platformUserId,
    userId,
    stake: input.stake,
    betColor: input.color,
    slot,
    payout,
    createdAt: new Date(),
  });

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
