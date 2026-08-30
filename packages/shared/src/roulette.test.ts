import { describe, expect, it } from 'vitest';
import { BET, colorOfSlot, maxBet, parseColor, payoutFor, WHEEL_ORDER } from './roulette';

/**
 * The wheel's arithmetic. The house edge is the entire economic argument for letting people spin at
 * all — if it drifts above 1 the wheel stops being a game and becomes a mint — and the bet cap is
 * the only thing standing between a viewer and losing a month of watching in one command.
 */
describe('the wheel', () => {
  it('splits 18/18/1', () => {
    const counts = { red: 0, black: 0, green: 0 };
    for (const slot of WHEEL_ORDER) counts[colorOfSlot(slot)]++;
    expect(counts).toEqual({ red: 18, black: 18, green: 1 });
    expect(new Set(WHEEL_ORDER).size).toBe(37);
  });

  it('keeps the house edge on both bets', () => {
    const slots = WHEEL_ORDER;
    const ev = (bet: 'red' | 'green') =>
      slots.reduce((sum, s) => sum + payoutFor(bet, s, 1), 0) / slots.length;
    // 2.7% on a colour, 5.4% on green — the pair balances at (1 − p) = 35p, p = 1/36.
    expect(ev('red')).toBeCloseTo(36 / 37, 9);
    expect(ev('green')).toBeCloseTo(35 / 37, 9);
    expect(ev('red')).toBeLessThan(1);
    expect(ev('green')).toBeLessThan(1);
  });

  it('returns the stake inside a win and nothing on a loss', () => {
    const red = WHEEL_ORDER.find((s) => colorOfSlot(s) === 'red')!;
    expect(payoutFor('red', red, 500)).toBe(1000);
    expect(payoutFor('black', red, 500)).toBe(0);
    expect(payoutFor('green', 0, 500)).toBe(17_500);
  });
});

describe('bet cap', () => {
  // A flat 1000 is playable from the first day; a pure share told someone with 400 dust they could
  // risk 40, which is not a bet.
  it('lets anyone stake the floor, whatever their balance', () => {
    expect(maxBet(1200)).toBe(BET.floor);
    expect(maxBet(BET.floor)).toBe(BET.floor);
    expect(maxBet(9_990)).toBe(BET.floor);
  });

  it('switches to the share once that is the bigger number', () => {
    // Ten thousand is where a tenth of the balance overtakes the floor.
    expect(maxBet(20_000)).toBe(2_000);
    expect(maxBet(81_655)).toBe(8_165);
  });

  it('never exceeds the balance, however small', () => {
    expect(maxBet(400)).toBe(400);
    expect(maxBet(BET.min)).toBe(BET.min);
    expect(maxBet(BET.min - 1)).toBe(0);
    expect(maxBet(0)).toBe(0);
  });

  it('stops at the hard ceiling however rich the player', () => {
    expect(maxBet(10_000_000)).toBe(BET.cap);
  });
});

describe('colour input', () => {
  it('takes the word the way someone types it mid-stream', () => {
    for (const word of ['red', 'RED', ' r ', 'красное', 'червоне']) {
      expect(parseColor(word)).toBe('red');
    }
    expect(parseColor('чёрное')).toBe('black');
    expect(parseColor('черное')).toBe('black'); // no ё on many keyboards
    expect(parseColor('g')).toBe('green');
    expect(parseColor('blue')).toBeNull();
  });
});
