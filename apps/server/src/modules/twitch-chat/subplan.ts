import type { ChatSubTier } from './eventsub';

export interface PlanChannel {
  channelId: string;
  /** Raw numeric Twitch id of the broadcaster — the subscription's condition. */
  broadcasterId: string;
  /** The streamer left the chat overlay on: the only consumer of notices and moderation events. */
  chatOverlay: boolean;
}

export interface PlanOpts {
  now: number;
  /** An OBS overlay is connected for this channel — our platform-agnostic "stream is on" signal. */
  live(channelId: string): boolean;
  /** channel id -> when an overlay was last seen. Updated in place; stale entries are dropped. */
  lastLiveAt: Map<string, number>;
  graceMs: number;
}

/**
 * Which channels the bot subscribes to right now, and how deep.
 *
 * Every consumer downstream of a chat event is already gated on a connected overlay, so a channel
 * nobody is streaming costs subscriptions and buys nothing — and Twitch caps a WebSocket session at
 * 300 of them. The grace period keeps a channel subscribed across an OBS scene switch or a browser
 * source reload, which drop the overlay for seconds.
 */
export function planSubs(channels: PlanChannel[], opts: PlanOpts): Map<string, ChatSubTier> {
  const { now, lastLiveAt, graceMs } = opts;
  const plan = new Map<string, ChatSubTier>();
  for (const ch of channels) {
    if (opts.live(ch.channelId)) lastLiveAt.set(ch.channelId, now);
    const seen = lastLiveAt.get(ch.channelId);
    if (seen === undefined || now - seen > graceMs) continue;
    plan.set(ch.broadcasterId, ch.chatOverlay ? 'full' : 'core');
  }
  // Forget channels that went quiet, so the map doesn't grow with every channel ever seen live.
  for (const [channelId, at] of lastLiveAt) {
    if (now - at > graceMs) lastLiveAt.delete(channelId);
  }
  return plan;
}
