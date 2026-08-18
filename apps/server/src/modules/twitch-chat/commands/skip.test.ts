import { describe, expect, it } from 'vitest';
import { skip } from './skip';
import type { CommandContext, CommandDeps, SkipResult } from './types';

/**
 * `!skip` is the one command that removes a post, so what it says back matters as much as what it
 * does: a viewer whose vote landed must be able to tell it landed, and a viewer whose vote was
 * only counted quietly must not be told it was ignored.
 */
describe('!skip', () => {
  const ctx = (privileged = false): CommandContext => ({
    channelId: 'ch1',
    twitchId: '42',
    login: 'viewer',
    name: 'Viewer',
    args: [],
    locale: 'ru',
    privileged,
  });

  const deps = (res: SkipResult): CommandDeps =>
    ({
      skip: async () => res,
    }) as unknown as CommandDeps;

  it('reports the running count so chat knows how far off it is', async () => {
    const line = await skip.run(ctx(), deps({ kind: 'voted', have: 2, need: 5 }));
    expect(line).toEqual({ name: 'Viewer', text: '2/5 за скип' });
  });

  it('tells a vote-skip apart from a moderator one', async () => {
    const byVote = await skip.run(ctx(), deps({ kind: 'skipped', byVote: true }));
    const byMod = await skip.run(ctx(true), deps({ kind: 'skipped', byVote: false }));
    expect(byVote?.text).toBe('голосов хватило — пропускаю');
    expect(byMod?.text).toBe('пропускаю');
  });

  it('says nothing when the tally already spoke, and nothing at all when disabled', async () => {
    expect(await skip.run(ctx(), deps({ kind: 'silent' }))).toBeNull();
    expect(await skip.run(ctx(), deps({ kind: 'disabled' }))).toBeNull();
  });

  it('answers an empty screen instead of leaving the viewer guessing', async () => {
    const line = await skip.run(ctx(), deps({ kind: 'nothing' }));
    expect(line).toEqual({ name: 'Viewer', text: 'сейчас на экране пусто' });
  });

  // The registry's per-caller silence would swallow the VOTE, not just its answer — see skip.ts.
  it('opts out of the shared command cooldown', () => {
    expect(skip.cooldownMs).toBe(0);
  });
});
