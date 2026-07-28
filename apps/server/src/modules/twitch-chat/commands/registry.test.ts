import { describe, expect, it } from 'vitest';
import { isCommand } from './index';
import type { ChannelCommandState } from './types';

/**
 * What the chat mirror asks before deciding to swallow a message. Getting this wrong is invisible
 * in testing and infuriating live: the viewer's line vanishes from the overlay and nothing answers
 * it, which is exactly what happens if we claim a trigger the streamer never turned on — `!say`
 * belongs to somebody else's bot in most channels.
 */
describe('isCommand', () => {
  const msg = (text: string) => [{ type: 'text' as const, text }];
  const state = (patch: Partial<ChannelCommandState> = {}): ChannelCommandState => ({
    playEnabled: false,
    ttsEnabled: false,
    ...patch,
  });

  it('claims a command that always works', () => {
    expect(isCommand(msg('!balance'), state())).toBe(true);
  });

  it('leaves other chatter alone', () => {
    expect(isCommand(msg('hello everyone'), state())).toBe(false);
    expect(isCommand(msg('!lurk'), state())).toBe(false);
  });

  it('leaves an opt-in trigger alone until the streamer turns it on', () => {
    expect(isCommand(msg('!tts hi'), state())).toBe(false);
    expect(isCommand(msg('!say hi'), state())).toBe(false);
    expect(isCommand(msg('!tts hi'), state({ ttsEnabled: true }))).toBe(true);
    expect(isCommand(msg('!play link'), state({ playEnabled: true }))).toBe(true);
  });
});
