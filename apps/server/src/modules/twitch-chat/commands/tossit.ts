// The registry imports this file and this file needs the registry — inherent to a help command.
// Safe as a plain import: `availableTriggers` is a hoisted function declaration and is only called
// at answer time, long after both modules have finished initialising.
import { availableTriggers } from './index';
import type { ChatCommand } from './types';

/**
 * `!tossit` — the front door. Answers with the streamer's own page and what else the bot answers
 * to, which is the one thing a viewer cannot discover on their own: every other command is
 * invisible until somebody names it. Deliberately wordless (link + triggers), so it reads the same
 * in any language, and built from the registry rather than a hand-kept list — a command that is off
 * in this channel is never advertised, and a new one needs no edit here.
 */
export const tossit: ChatCommand = {
  name: 'tossit',
  aliases: ['help', 'commands'],
  async run(ctx, deps) {
    const others = availableTriggers(ctx, deps).filter((name) => name !== tossit.name);
    return {
      name: ctx.name,
      text: others.map((name) => `!${name}`).join(' ') || undefined,
      hint: deps.channelUrl(ctx.channelId),
    };
  },
};
