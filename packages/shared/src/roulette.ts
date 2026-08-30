/**
 * The dust wheel: single-zero roulette, 37 slots. One module so the site's animation, the server's
 * payout and the bot's answer can never disagree about what a spin meant.
 *
 * The two bets balance at `(1 − p) = 35p`, p = 1/36 — that is WHY green pays 35 against 2. Moving
 * one multiplier without the other breaks the identity and can make the wheel mint dust, so treat
 * PAYOUT as a pair, not as two numbers.
 *
 * It is an engagement loop, not the sink: at a 2.7% edge, draining the dust already sitting idle
 * would take tens of millions in turnover. Raising the multipliers changes how it feels, not what
 * the economy loses.
 */

export type RouletteColor = 'red' | 'black' | 'green';

export const ROULETTE_SLOTS = 37;

/** European wheel reds. Kept authentic so the site can draw numbered pockets without a reshuffle. */
const RED_SLOTS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

/**
 * The physical order of the pockets on a European wheel. Nothing about the odds depends on it —
 * every slot is equally likely — but a reel drawn in this order alternates red and black the way a
 * real wheel does, with the single green sitting alone. Numeric order would read as two solid
 * blocks and look rigged at a glance.
 */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

/** Total returned per 1 staked, the stake included: a won 500 on red pays back 1000. */
export const PAYOUT: Record<RouletteColor, number> = { red: 2, black: 2, green: 35 };

export function colorOfSlot(slot: number): RouletteColor {
  if (slot === 0) return 'green';
  return RED_SLOTS.has(slot) ? 'red' : 'black';
}

/** What a bet returns (0 = lost). Stake included, so `payout - stake` is the net. */
export function payoutFor(bet: RouletteColor, slot: number, stake: number): number {
  return colorOfSlot(slot) === bet ? stake * PAYOUT[bet] : 0;
}

export const BET = {
  /** Below this a spin is not worth a chat line. */
  min: 10,
  /** Everyone may stake this much whatever their balance — it is the welcome bonus and the price of
   *  the cheapest cosmetic, so "one spin, one thing you could have bought" is always on the table. */
  floor: 1000,
  /** Hard ceiling whatever the balance, so one command can never move a fortune. */
  cap: 10_000,
  /** Share of the balance a single bet may risk, once that is more than the floor. */
  share: 0.1,
} as const;

/**
 * The biggest bet this balance may place; 0 when it cannot play at all.
 *
 * A flat 1000 up to a balance of ten thousand, then a tenth of it, then a hard stop at ten thousand.
 * A pure share was wrong at the bottom: it told someone with 400 dust they could risk 40, which is
 * not a bet, it is a rounding error. A pure flat cap is wrong at the top: 1000 is nothing to our
 * largest holder. The floor makes the game playable from the first day and the share keeps it
 * meaningful after, and the ceiling visibly growing past 10k is its own reason to keep earning.
 *
 * The outer `min` is what stops it offering more than the player actually has.
 */
export function maxBet(balance: number): number {
  if (balance < BET.min) return 0;
  return Math.min(balance, Math.max(BET.floor, Math.min(BET.cap, Math.floor(balance * BET.share))));
}

const COLOR_WORDS: Record<string, RouletteColor> = {
  red: 'red',
  r: 'red',
  к: 'red',
  красное: 'red',
  красный: 'red',
  червоне: 'red',
  black: 'black',
  b: 'black',
  ч: 'black',
  чёрное: 'black',
  черное: 'black',
  чорне: 'black',
  green: 'green',
  g: 'green',
  з: 'green',
  зелёное: 'green',
  зеленое: 'green',
  зелене: 'green',
};

/** Parse a colour the way someone would type it mid-stream, in any of the bot's three languages. */
export function parseColor(word: string): RouletteColor | null {
  return COLOR_WORDS[word.trim().toLowerCase()] ?? null;
}
