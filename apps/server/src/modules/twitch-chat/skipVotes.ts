/**
 * Who wants the current show gone. In memory only, and deliberately so: a vote is about ONE
 * submission that is on screen right now, so it has nothing to survive — a restart takes the show
 * down with it anyway.
 *
 * The tally is keyed by the submission being voted on, which is what makes votes expire by
 * themselves: the next post starts an empty tally instead of inheriting a nearly-passed one, and
 * chat cannot pre-load votes to kill whatever comes next the moment it appears.
 */

/** One count line per channel per this window, however many votes land in it. Several people
 *  typing `!skip` at once is the normal case, and it must not become several bot lines. */
const ANNOUNCE_MS = 2_000;
/** Same idea for "nothing is on screen", which is per-person: it answers a mistake, once. */
const NOTHING_MS = 15_000;
/** Sweep the per-viewer map once it outgrows any plausible live audience. */
const SWEEP_AT = 5_000;

export type VoteOutcome =
  /** Threshold reached — the caller skips. */
  | 'passed'
  /** Counted, and worth saying out loud. */
  | 'counted'
  /** Counted (or already counted), but saying so would just be noise. */
  | 'silent';

export interface SkipVotes {
  vote(input: {
    channelId: string;
    submissionId: string;
    twitchId: string;
    need: number;
    now?: number;
  }): { outcome: VoteOutcome; have: number; need: number };
  /** Drop a channel's tally — the show it belonged to is gone (skipped by a mod, by points). */
  clear(channelId: string): void;
  /** Should we answer this viewer's `!skip` with "nothing on screen"? False when we just did. */
  answerNothing(channelId: string, twitchId: string, now?: number): boolean;
}

export function createSkipVotes(): SkipVotes {
  const tallies = new Map<string, { submissionId: string; voters: Set<string>; saidAt: number }>();
  const nothingSaid = new Map<string, number>();

  return {
    vote({ channelId, submissionId, twitchId, need, now = Date.now() }) {
      let tally = tallies.get(channelId);
      if (!tally || tally.submissionId !== submissionId) {
        // -Infinity, not 0: "never announced" must not depend on where the clock starts.
        tally = { submissionId, voters: new Set(), saidAt: Number.NEGATIVE_INFINITY };
        tallies.set(channelId, tally);
      }
      // A second `!skip` from the same person is not a second vote, and answering it again would
      // hand a spammer the bot's voice.
      if (tally.voters.has(twitchId)) {
        return { outcome: 'silent', have: tally.voters.size, need };
      }
      tally.voters.add(twitchId);
      const have = tally.voters.size;
      if (have >= need) {
        tallies.delete(channelId);
        return { outcome: 'passed', have, need };
      }
      if (now - tally.saidAt < ANNOUNCE_MS) return { outcome: 'silent', have, need };
      tally.saidAt = now;
      return { outcome: 'counted', have, need };
    },

    clear(channelId) {
      tallies.delete(channelId);
    },

    answerNothing(channelId, twitchId, now = Date.now()) {
      const key = `${channelId} ${twitchId}`;
      if (now - (nothingSaid.get(key) ?? Number.NEGATIVE_INFINITY) < NOTHING_MS) return false;
      if (nothingSaid.size > SWEEP_AT) {
        for (const [k, at] of nothingSaid) if (now - at >= NOTHING_MS) nothingSaid.delete(k);
      }
      nothingSaid.set(key, now);
      return true;
    },
  };
}
