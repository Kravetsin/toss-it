import type { BotLocale, ChatSystemLine } from '@tmw/shared';
import type { QueueState } from '../../../playback';

/** What the triggering message tells a command about its caller. */
export interface CommandContext {
  channelId: string;
  /** Author's raw Twitch id — the key dust, level and identities all hang on. */
  twitchId: string;
  login: string;
  /** Display name, used as-is in the answer line. */
  name: string;
  /** Whitespace-split arguments after the trigger. */
  args: string[];
  /** Language this channel's bot answers in. */
  locale: BotLocale;
  /** Broadcaster or moderator of THIS channel — read from the message's own Twitch badges. */
  privileged: boolean;
}

/**
 * Outcome of a `!play` link, mapped to a chat answer by the command. `disabled` = the channel
 * never turned the command on (stay silent); the rest each get a short localized line.
 */
export type PlayResult =
  | { kind: 'disabled' }
  | { kind: 'ratelimited'; waitS: number }
  | { kind: 'channelFull' }
  /** The streamer switched submissions off — every door says so, not just the website. */
  | { kind: 'paused' }
  | { kind: 'unplayable' }
  | { kind: 'queued' }
  | { kind: 'moderation' };

/**
 * Outcome of a `!tts` line. Mostly the same shapes as a link request, because it is the same
 * pipeline — `tooLong` is the one thing only text can run into.
 */
export type SayResult =
  | { kind: 'disabled' }
  | { kind: 'ratelimited'; waitS: number }
  | { kind: 'channelFull' }
  | { kind: 'paused' }
  | { kind: 'tooLong'; max: number }
  | { kind: 'queued' }
  | { kind: 'moderation' };

/**
 * Outcome of a `!skip`. `silent` is a deliberate non-answer: a second vote from the same person,
 * a count line we just posted, or a repeated "nothing is playing" — all of them true, none of them
 * worth another line in someone's chat.
 */
export type SkipResult =
  | { kind: 'disabled' }
  | { kind: 'nothing' }
  | { kind: 'silent' }
  | { kind: 'voted'; have: number; need: number }
  /** `byVote` false = the streamer or a moderator, whose single command is enough. */
  | { kind: 'skipped'; byVote: boolean };

/** The streamer's own switches over the command set — everything `available()` is allowed to ask
 *  about. Kept to plain data so the dashboard can answer it from a channel row. */
export interface ChannelCommandState {
  /** `!play` is off by default: ordering media from chat is a separate yes from /mod'ding the bot. */
  playEnabled: boolean;
  /** `!tts` — same reasoning, and it puts the viewer's own words on the stream. */
  ttsEnabled: boolean;
  /** `!skip` — the one command that takes a post off the screen instead of putting one on it. */
  skipEnabled: boolean;
}

/** Live state a command cannot read from the DB, injected by the twitch-chat module. */
export interface CommandDeps {
  /** The streamer's public Tossit page, ready to paste into chat (no scheme — chat clients link it
   *  anyway, and a bare host reads shorter). */
  channelUrl(channelId: string): string;
  /** This channel's command switches, for the commands that need to know about each other. */
  commandState(channelId: string): ChannelCommandState;
  /** The playback queue lives in server memory, not in SQL — see PlaybackManager.queueState. */
  queueState(channelId: string, submissionId: string): QueueState | null;
  /** All-time per-channel XP for a twitch id (messages + watch-minutes + 50× aired sends). The
   *  module already computes and caches this for level badges, so commands reuse it. */
  xpFor(channelId: string, twitchId: string): Promise<number>;
  /** Order a YouTube link from chat (`!play`). Owns the enable gate, the per-viewer rate limit and
   *  the submission — the command only turns the result into a line. Injected by the module. */
  play(input: {
    channelId: string;
    twitchId: string;
    name: string;
    link: string;
  }): Promise<PlayResult>;
  /** Put a line on stream (`!tts`). Same ownership split as `play`: the module holds the gate, the
   *  limits and the submission; the command only turns the result into a line. */
  say(input: {
    channelId: string;
    twitchId: string;
    name: string;
    text: string;
  }): Promise<SayResult>;
  /** Skip what is on screen (`!skip`). Owns the enable gate, the vote tally and the playback call;
   *  the command only turns the result into a line. */
  skip(input: { channelId: string; twitchId: string; privileged: boolean }): Promise<SkipResult>;
}

/** One command = one file in this folder + one entry in the registry (see ./index.ts). */
export interface ChatCommand {
  /** Trigger without the leading '!', lowercase. */
  name: string;
  /** Extra triggers, lowercase. */
  aliases?: string[];
  /** Offered in a channel with these toggles? Absent = always. Read by `!tossit` (so a command the
   *  streamer never turned on is not advertised) and by the dashboard's command list, which is why
   *  it takes plain channel state instead of a caller's context. Running is still each command's
   *  own business: `!play` stays silent by itself when disabled. */
  available?(state: ChannelCommandState): boolean;
  /** Per-caller silence after a run, overriding the registry default. 0 = never throttled here,
   *  for a command that has to see every message (`!skip` counts votes; a swallowed one is a lost
   *  vote) and does its own silencing instead. */
  cooldownMs?: number;
  /** The line to answer with, or null to stay silent. */
  run(ctx: CommandContext, deps: CommandDeps): Promise<ChatSystemLine | null>;
}
