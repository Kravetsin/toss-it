import { describe, expect, it } from 'vitest';
import { runCommand, toChatText } from './index';
import { tossit } from './tossit';
import type { CommandContext, CommandDeps } from './types';

/**
 * `!tossit` is the only command a viewer can find without being told, so what it lists has to be
 * true: advertising `!play` where the streamer never enabled it sends people into silence.
 */
describe('!tossit', () => {
  const ctx = (channelId = 'ch1'): CommandContext => ({
    channelId,
    twitchId: '42',
    login: 'viewer',
    name: 'Viewer',
    args: [],
    locale: 'ru',
  });

  const deps = (playEnabled: boolean): CommandDeps => ({
    queueState: () => null,
    xpFor: async () => 0,
    play: async () => ({ kind: 'disabled' }),
    channelUrl: () => 'toss-it.org/c/kravets',
    playEnabled: () => playEnabled,
  });

  it('lists the other commands and points at the channel page', async () => {
    const line = await tossit.run(ctx(), deps(false));
    expect(line).toEqual({
      name: 'Viewer',
      text: '!balance !xp !queue',
      hint: 'toss-it.org/c/kravets',
    });
  });

  it('advertises !play only where the streamer turned it on', async () => {
    const off = await tossit.run(ctx(), deps(false));
    const on = await tossit.run(ctx(), deps(true));
    expect(off?.text).not.toContain('!play');
    expect(on?.text).toContain('!play');
  });

  it('never lists itself — the viewer just typed it', async () => {
    const line = await tossit.run(ctx(), deps(true));
    expect(line?.text).not.toContain('!tossit');
  });

  it('reads as one line in Twitch chat', async () => {
    const line = await tossit.run(ctx(), deps(false));
    expect(toChatText(line!)).toBe('@Viewer · !balance !xp !queue — toss-it.org/c/kravets');
  });

  // Fresh channel ids: the registry's per-channel floor would swallow back-to-back runs otherwise.
  it('answers to its aliases too', async () => {
    const text = (f: string) => [{ type: 'text' as const, text: f }];
    expect(await runCommand(text('!tossit'), ctx('a'), deps(false))).toBeTruthy();
    expect(await runCommand(text('!help'), ctx('b'), deps(false))).toBeTruthy();
    expect(await runCommand(text('!commands'), ctx('c'), deps(false))).toBeTruthy();
    expect(await runCommand(text('!nothing'), ctx('d'), deps(false))).toBeNull();
  });
});
