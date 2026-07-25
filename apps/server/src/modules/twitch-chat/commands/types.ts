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
}

/**
 * Outcome of a `!play` link, mapped to a chat answer by the command. `disabled` = the channel
 * never turned the command on (stay silent); the rest each get a short localized line.
 */
export type PlayResult =
  | { kind: 'disabled' }
  | { kind: 'ratelimited'; waitS: number }
  | { kind: 'channelFull' }
  | { kind: 'unplayable' }
  | { kind: 'queued' }
  | { kind: 'moderation' };

/** Live state a command cannot read from the DB, injected by the twitch-chat module. */
export interface CommandDeps {
  /** The playback queue lives in server memory, not in SQL — see PlaybackManager.queueState. */
  queueState(channelId: string, submissionId: string): QueueState | null;
  /** All-time per-channel XP for a twitch id (messages + watch-minutes + 10× aired sends). The
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
}

/** One command = one file in this folder + one entry in the registry (see ./index.ts). */
export interface ChatCommand {
  /** Trigger without the leading '!', lowercase. */
  name: string;
  /** Extra triggers, lowercase. */
  aliases?: string[];
  /** The line to answer with, or null to stay silent. */
  run(ctx: CommandContext, deps: CommandDeps): Promise<ChatSystemLine | null>;
}
