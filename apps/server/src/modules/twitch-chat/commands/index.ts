import type { ChatFragment, ChatSystemLine } from '@tmw/shared';
import { balance } from './balance';
import { queue } from './queue';
import type { ChatCommand, CommandContext, CommandDeps } from './types';

export type { ChatCommand, CommandContext, CommandDeps } from './types';

/** The registry: one entry per command file in this folder. */
const COMMANDS: ChatCommand[] = [balance, queue];

const byTrigger = new Map<string, ChatCommand>();
for (const cmd of COMMANDS) {
  for (const trigger of [cmd.name, ...(cmd.aliases ?? [])]) byTrigger.set(trigger, cmd);
}

/**
 * Flatten an answer for the Twitch chat, where there is no markup to lean on. Stays as
 * language-neutral as the overlay card: mention + value + the brand star (U+2726, our own mark
 * rather than the ⭐ emoji). The leading @name also keeps consecutive answers distinct, which is
 * what stops Twitch's identical-message filter from eating the second one.
 */
export function toChatText(line: ChatSystemLine): string {
  const parts = [`@${line.name}`];
  if (line.text) parts.push(line.text);
  if (line.dust !== undefined) parts.push(`${line.dust} ✦`);
  const body = parts.join(' · ');
  return line.hint ? `${body} — ${line.hint}` : body;
}

/** Per-viewer silence after a command, so one person cannot fill the overlay by themselves.
 *  Keyed per command, not per person: asking your balance should not mute your next !queue. */
const USER_COOLDOWN_MS = 15_000;
/** Per-channel floor, so a coordinated group cannot either. */
const CHANNEL_COOLDOWN_MS = 3_000;
/** Sweep the per-user map once it outgrows any plausible live audience. */
const SWEEP_AT = 5_000;

/** `${channelId} ${twitchId} ${command}` -> last accepted run. */
const lastByUser = new Map<string, number>();
const lastByChannel = new Map<string, number>();

/** Leading `!word`; letters cover non-Latin triggers, since chat is not English-only. */
const TRIGGER_RE = /^!([\p{L}\d_]{1,24})(?:\s+|$)/u;

function onCooldown(channelId: string, twitchId: string, command: string, now: number): boolean {
  const userKey = `${channelId} ${twitchId} ${command}`;
  if (now - (lastByUser.get(userKey) ?? 0) < USER_COOLDOWN_MS) return true;
  if (now - (lastByChannel.get(channelId) ?? 0) < CHANNEL_COOLDOWN_MS) return true;
  if (lastByUser.size > SWEEP_AT) {
    for (const [key, at] of lastByUser) if (now - at >= USER_COOLDOWN_MS) lastByUser.delete(key);
  }
  lastByUser.set(userKey, now);
  lastByChannel.set(channelId, now);
  return false;
}

/**
 * Run a chat message through the command registry. Delivery is the caller's business — the same
 * answer may go to the overlay, to Twitch chat, or both. Cooldowns are charged only for messages
 * that actually resolve to one of our commands, so another bot's `!lurk` traffic never silences
 * ours; the per-channel floor is also what keeps us far under Twitch's send rate limit.
 */
export async function runCommand(
  fragments: ChatFragment[],
  ctx: Omit<CommandContext, 'args'>,
  deps: CommandDeps,
): Promise<ChatSystemLine | null> {
  const text = fragments.map((f) => f.text).join('');
  const match = TRIGGER_RE.exec(text.trim());
  if (!match) return null;
  const cmd = byTrigger.get(match[1]!.toLowerCase());
  if (!cmd) return null;
  if (onCooldown(ctx.channelId, ctx.twitchId, cmd.name, Date.now())) return null;
  const args = text.trim().slice(match[0].length).split(/\s+/).filter(Boolean);
  return cmd.run({ ...ctx, args }, deps);
}
