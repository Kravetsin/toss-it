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

/** Live state a command cannot read from the DB, injected by the twitch-chat module. */
export interface CommandDeps {
  /** The playback queue lives in server memory, not in SQL — see PlaybackManager.queueState. */
  queueState(channelId: string, submissionId: string): QueueState | null;
  /** All-time per-channel XP for a twitch id (messages + watch-minutes + 10× aired sends). The
   *  module already computes and caches this for level badges, so commands reuse it. */
  xpFor(channelId: string, twitchId: string): Promise<number>;
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
