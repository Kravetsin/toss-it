import { describe, expect, it } from 'vitest';
import { createSkipVotes } from './skipVotes';

/**
 * The tally is what stands between "chat can skip a bad song" and "two people can clear the screen
 * all stream". Every rule here is one of those two outcomes, so they are pinned individually.
 */
describe('skip votes', () => {
  const base = { channelId: 'ch1', submissionId: 'sub1', need: 3 };

  it('passes only when enough DIFFERENT people ask', () => {
    const votes = createSkipVotes();
    expect(votes.vote({ ...base, twitchId: 'a', now: 0 }).outcome).toBe('counted');
    // The same person again is not a second vote, and gets no second answer either.
    const again = votes.vote({ ...base, twitchId: 'a', now: 5_000 });
    expect(again).toEqual({ outcome: 'silent', have: 1, need: 3 });
    expect(votes.vote({ ...base, twitchId: 'b', now: 10_000 }).outcome).toBe('counted');
    expect(votes.vote({ ...base, twitchId: 'c', now: 20_000 })).toEqual({
      outcome: 'passed',
      have: 3,
      need: 3,
    });
  });

  it('starts the next post from zero instead of inheriting a nearly-passed tally', () => {
    const votes = createSkipVotes();
    votes.vote({ ...base, twitchId: 'a', now: 0 });
    votes.vote({ ...base, twitchId: 'b', now: 0 });
    // A different submission is a different question — otherwise chat could load up votes on a
    // post that is ending anyway and kill whatever appears next on sight.
    const first = votes.vote({ ...base, submissionId: 'sub2', twitchId: 'c', now: 100 });
    expect(first).toEqual({ outcome: 'counted', have: 1, need: 3 });
  });

  it('counts every vote in a burst but only says so once', () => {
    const votes = createSkipVotes();
    expect(votes.vote({ ...base, need: 5, twitchId: 'a', now: 0 }).outcome).toBe('counted');
    const quiet = votes.vote({ ...base, need: 5, twitchId: 'b', now: 300 });
    // Silent, yet counted — the vote is what matters, the line is just noise at this rate.
    expect(quiet).toEqual({ outcome: 'silent', have: 2, need: 5 });
    expect(votes.vote({ ...base, need: 5, twitchId: 'c', now: 3_000 })).toEqual({
      outcome: 'counted',
      have: 3,
      need: 5,
    });
  });

  it('drops the tally when the show it belonged to is skipped another way', () => {
    const votes = createSkipVotes();
    votes.vote({ ...base, twitchId: 'a', now: 0 });
    votes.clear('ch1');
    expect(votes.vote({ ...base, twitchId: 'b', now: 100 })).toEqual({
      outcome: 'counted',
      have: 1,
      need: 3,
    });
  });

  it('answers an empty screen once per person, not once per try', () => {
    const votes = createSkipVotes();
    expect(votes.answerNothing('ch1', 'a', 0)).toBe(true);
    expect(votes.answerNothing('ch1', 'a', 1_000)).toBe(false);
    // Someone else asking is a different person's question.
    expect(votes.answerNothing('ch1', 'b', 1_000)).toBe(true);
    expect(votes.answerNothing('ch1', 'a', 60_000)).toBe(true);
  });
});
