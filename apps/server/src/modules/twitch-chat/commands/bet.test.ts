import { describe, expect, it } from 'vitest';
import { BET } from '@tmw/shared';
import { bet } from './bet';
import type { BetOutcome } from '../../../roulette';
import type { CommandContext, CommandDeps } from './types';

/**
 * The chat door onto the wheel. The engine's own tests cover the money; what can only go wrong here
 * is the parsing — someone typing fast mid-stream, in one of three languages, in whichever order
 * they think of first.
 */
const ctx = (args: string[]): CommandContext => ({
  channelId: 'ch',
  twitchId: 'tw1',
  login: 'viewer',
  name: 'Viewer',
  args,
  locale: 'ru',
  privileged: false,
});

function deps(
  outcome: BetOutcome = { kind: 'broke', balance: 0, registered: true },
  rouletteEnabled = true,
) {
  const seen: { stake: number; color: string }[] = [];
  const d = {
    queueState: () => null,
    xpFor: async () => 0,
    play: async () => ({ kind: 'disabled' }) as const,
    say: async () => ({ kind: 'disabled' }) as const,
    skip: async () => ({ kind: 'disabled' }) as const,
    bet: async (input: { stake: number; color: string }) => {
      seen.push({ stake: input.stake, color: input.color });
      return outcome;
    },
    betState: async () => ({ balance: 4000, max: 400, registered: true }),
    channelUrl: () => 'toss-it.org/c/x',
    commandState: () => ({
      playEnabled: false,
      ttsEnabled: false,
      skipEnabled: false,
      rouletteEnabled,
    }),
  } as unknown as CommandDeps;
  return { deps: d, seen };
}

// available() only feeds the !tossit listing and the dashboard catalog — runCommand never consults
// it, so a switchable command has to refuse for itself. Without this the wheel answered everywhere.
describe('!bet gate', () => {
  it('says nothing at all in a channel that never switched the wheel on', async () => {
    for (const args of [[], ['100', 'красное'], ['all', 'зелёное']]) {
      const { deps: d, seen } = deps(undefined, false);
      expect(await bet.run(ctx(args), d)).toBeNull();
      expect(seen).toHaveLength(0);
    }
  });
});

describe('!bet parsing', () => {
  it('takes the amount and the colour in either order', async () => {
    for (const args of [
      ['100', 'красное'],
      ['красное', '100'],
      ['100', 'r'],
      ['ЧЁРНОЕ', '100'],
    ]) {
      const { deps: d, seen } = deps({
        kind: 'done',
        stake: 100,
        betColor: 'red',
        slot: 1,
        resultColor: 'red',
        payout: 200,
        balance: 100,
      });
      await bet.run(ctx(args), d);
      expect(seen).toHaveLength(1);
      expect(seen[0]!.stake).toBe(100);
    }
  });

  // The cap is a protection, not a suggestion: reading `all` as the balance would hand the whole
  // pile over on one word.
  it('reads "all" as the cap, not the balance', async () => {
    for (const word of ['all', 'ВСЁ', 'все', 'max']) {
      const { deps: d, seen } = deps();
      await bet.run(ctx([word, 'зелёное']), d);
      expect(seen[0]!.stake).toBe(400);
    }
  });

  it('answers with usage rather than betting on nonsense', async () => {
    for (const args of [['100'], ['красное'], ['abc', 'красное'], ['0', 'красное']]) {
      const { deps: d, seen } = deps();
      const line = await bet.run(ctx(args), d);
      expect(seen).toHaveLength(0);
      expect(line?.text).toContain('!bet');
    }
  });

  // A bare !bet is the sign-up surface, so it must answer without placing anything.
  it('reports the balance and cap on a bare call', async () => {
    const { deps: d, seen } = deps();
    const line = await bet.run(ctx([]), d);
    expect(seen).toHaveLength(0);
    expect(line?.dust).toBe(4000);
    expect(line?.text).toContain('400');
  });

  it('shows the net, not the gross, on a win', async () => {
    const { deps: d } = deps({
      kind: 'done',
      stake: 500,
      betColor: 'red',
      slot: 1,
      resultColor: 'red',
      payout: 1000,
      balance: 1500,
    });
    const line = await bet.run(ctx(['500', 'красное']), d);
    // The stake coming back is not winnings.
    expect(line?.dust).toBe(500);
  });

  it('shows the stake as a loss when nothing came back', async () => {
    const { deps: d } = deps({
      kind: 'done',
      stake: 500,
      betColor: 'red',
      slot: 26,
      resultColor: 'black',
      payout: 0,
      balance: 500,
    });
    const line = await bet.run(ctx(['500', 'красное']), d);
    expect(line?.dust).toBe(-500);
  });

  it('points an unregistered chatter at the site when they cannot play', async () => {
    const { deps: d } = deps({ kind: 'broke', balance: 12, registered: false });
    const line = await bet.run(ctx(['10', 'красное']), d);
    expect(line?.hint).toBe('toss-it.org');
    expect(line?.dust).toBe(12);
  });

  it('names the floor and the cap instead of silently clamping', async () => {
    const small = deps({ kind: 'tooSmall', min: BET.min });
    expect((await bet.run(ctx(['1', 'красное']), small.deps))?.text).toContain(String(BET.min));
    const big = deps({ kind: 'overCap', max: 400, balance: 4000 });
    expect((await bet.run(ctx(['9999', 'красное']), big.deps))?.text).toContain('400');
  });
});
