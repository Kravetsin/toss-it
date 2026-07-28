import { t } from '../strings';
import type { ChatCommand } from './types';

/**
 * `!play <youtube link>` — order a video/track straight from chat, no channel points needed. This
 * is the reach: streamers with no channel-points economy still get the same YouTube-request flow.
 * The command is deliberately thin — the module's `play` dep owns the enable gate, the per-viewer
 * rate limit and the submission (identical pipeline to a web/channel-points send); here we only
 * turn its result into a chat line. A `disabled` result means the streamer never opted in → silent.
 */
export const play: ChatCommand = {
  name: 'play',
  aliases: ['sr'],
  available: (state) => state.playEnabled,
  async run(ctx, deps) {
    // Everything after the trigger is the link (+ optional caption) — rejoined so a caption with
    // spaces survives the arg split.
    const link = ctx.args.join(' ').trim();
    if (!link) return { name: ctx.name, text: t(ctx.locale, 'playUsage') };

    const res = await deps.play({
      channelId: ctx.channelId,
      twitchId: ctx.twitchId,
      name: ctx.name,
      link,
    });
    switch (res.kind) {
      case 'disabled':
        return null;
      case 'ratelimited':
        return { name: ctx.name, text: t(ctx.locale, 'playWait', { n: res.waitS }) };
      case 'channelFull':
        return { name: ctx.name, text: t(ctx.locale, 'playFull') };
      case 'paused':
        return { name: ctx.name, text: t(ctx.locale, 'playPaused') };
      case 'unplayable':
        return { name: ctx.name, text: t(ctx.locale, 'playBad') };
      case 'queued':
        return { name: ctx.name, text: t(ctx.locale, 'playQueued') };
      case 'moderation':
        return { name: ctx.name, text: t(ctx.locale, 'playModeration') };
    }
  },
};
