/**
 * Which chat lines earn dust and XP.
 *
 * A message pays double a watched minute (DUST_POINTS.message), which is enough to be worth
 * farming, so the two cheapest ways to farm it are closed here: one-character lines and saying the
 * same thing again. Deliberately NOT a cooldown — Twitch chat has nowhere to display a timer, and a
 * rule a viewer cannot see reads as "why did he get more than me", which costs us more than the
 * dust does.
 *
 * Alternating two lines still slips through, and that is the accepted floor: past this point the
 * cheapest way to farm is to hold a conversation, which is the behaviour we are buying anyway.
 */

/** Shortest line that earns. Anything below is a farming token ("+", "1", "ку"), not a message. */
const MIN_LEN = 3;
/** How long a line stays "the same line again". Repeating yourself ten minutes later is
 *  conversation, not spam, so the guard forgets rather than blocking a phrase forever. */
const REPEAT_MS = 10 * 60_000;
/** Sweep the per-viewer map once it outgrows any plausible live audience. */
const SWEEP_AT = 5_000;

export interface EarningGuard {
  /** True = credit dust and bump the leaderboard. Records the line, so call it once per message. */
  earns(channelId: string, twitchId: string, text: string, now?: number): boolean;
  /** Drop lines old enough that nobody could still be repeating them. */
  prune(now?: number): void;
}

export function createEarningGuard(): EarningGuard {
  const lastLine = new Map<string, { text: string; at: number }>();

  function prune(now = Date.now()): void {
    for (const [key, seen] of lastLine) if (now - seen.at >= REPEAT_MS) lastLine.delete(key);
  }

  return {
    earns(channelId, twitchId, text, now = Date.now()) {
      const line = text.trim();
      if (line.length < MIN_LEN) return false;
      const key = `${channelId} ${twitchId}`;
      const prev = lastLine.get(key);
      if (prev && prev.text === line && now - prev.at < REPEAT_MS) return false;
      if (lastLine.size > SWEEP_AT) prune(now);
      lastLine.set(key, { text: line, at: now });
      return true;
    },
    prune,
  };
}
