import { describe, expect, it } from 'vitest';
import { BOT_LOCALES } from '@tmw/shared';
import { REWARD_PROMPT_MAX, REWARD_TITLE_MAX, rewardTextFor, type RewardKind } from './index';

/**
 * Twitch silently refuses a reward whose title or prompt is too long — a bare 400, which the create
 * path reads as "this reward already exists" and turns into `create_failed`. The failure is
 * invisible until a streamer tries to set the reward up, so the copy is measured here instead: a
 * prompt grows every time someone clarifies it, and the constants inside it can grow on their own.
 */
describe('reward copy fits what Twitch stores', () => {
  const kinds: RewardKind[] = ['stardust', 'youtube', 'tts', 'skip'];

  for (const kind of kinds) {
    for (const lang of BOT_LOCALES) {
      it(`${kind} / ${lang}`, () => {
        const { title, prompt } = rewardTextFor(kind, lang);
        expect(title.length).toBeLessThanOrEqual(REWARD_TITLE_MAX);
        expect(prompt.length).toBeLessThanOrEqual(REWARD_PROMPT_MAX);
      });
    }
  }

  // Every title carries "(Tossit)": it is how an existing reward is recovered by name after a 400.
  it('marks every reward as ours', () => {
    for (const kind of kinds) expect(rewardTextFor(kind, 'ru').title).toContain('(Tossit)');
  });
});
