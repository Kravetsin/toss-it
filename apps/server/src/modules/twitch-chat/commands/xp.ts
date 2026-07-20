import { levelThreshold, MAX_LEVEL, xpToLevel } from '@tmw/shared';
import { t } from './strings';
import type { ChatCommand } from './types';

/**
 * The caller's level and XP on THIS channel. Level is per-channel by design — a regular here is a
 * stranger elsewhere. The point is to surface progress the viewer earns invisibly (chatting,
 * watch-time, aired sends): showing "8000/12800 to the next rank" turns a hidden number into a
 * goal they did not have a second ago. Works for the unregistered too — channel_activity is keyed
 * by twitch id, so a lurker who never signed up still has a number to chase.
 */
export const xp: ChatCommand = {
  name: 'xp',
  aliases: ['level', 'уровень', 'рівень'],
  async run(ctx, deps) {
    const points = await deps.xpFor(ctx.channelId, ctx.twitchId);
    const level = xpToLevel(points);
    // At the cap there is no next threshold; below it, show progress toward the next rank. Level 0
    // reads naturally too — "0 · 100/200 XP" is exactly the climb to the first badge.
    const text =
      level >= MAX_LEVEL
        ? t(ctx.locale, 'xpMax', { lvl: level, xp: points })
        : t(ctx.locale, 'xpProgress', { lvl: level, xp: points, next: levelThreshold(level + 1) });
    return { name: ctx.name, text };
  },
};
