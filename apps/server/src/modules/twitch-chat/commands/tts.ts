import { t } from '../strings';
import type { ChatCommand } from './types';

/**
 * `!tts <text>` — put a line on stream without leaving chat. The shortest path there is: no site,
 * no account, no upload. Deliberately thin, like `!play`: the module's `say` dep owns the enable
 * gate, the rate limits and the submission, and whether the line is spoken or merely shown is the
 * channel's own TTS setting — this file only turns the outcome into a chat answer.
 */
export const tts: ChatCommand = {
  name: 'tts',
  aliases: ['say'],
  available: (state) => state.ttsEnabled,
  async run(ctx, deps) {
    const text = ctx.args.join(' ').trim();
    if (!text) return { name: ctx.name, text: t(ctx.locale, 'ttsUsage') };

    const res = await deps.say({
      channelId: ctx.channelId,
      twitchId: ctx.twitchId,
      name: ctx.name,
      text,
    });
    switch (res.kind) {
      case 'disabled':
        return null;
      case 'ratelimited':
        return { name: ctx.name, text: t(ctx.locale, 'ttsWait', { n: res.waitS }) };
      case 'channelFull':
        return { name: ctx.name, text: t(ctx.locale, 'ttsFull') };
      case 'paused':
        return { name: ctx.name, text: t(ctx.locale, 'ttsPaused') };
      case 'tooLong':
        return { name: ctx.name, text: t(ctx.locale, 'ttsLong', { n: res.max }) };
      case 'queued':
        return { name: ctx.name, text: t(ctx.locale, 'ttsQueued') };
      case 'moderation':
        return { name: ctx.name, text: t(ctx.locale, 'ttsModeration') };
    }
  },
};
