import { t } from '../strings';
import type { ChatCommand } from './types';

/**
 * `!fair` — the wheel's commitment, in the one place the accusations happen.
 *
 * A hash on the website answers nobody: the person who just lost is in chat, and so is everyone
 * reading their complaint. Being able to say "here is the hash, here is the last seed, check it
 * yourself" in the same room is the entire reason the chain exists.
 *
 * Offered wherever `!bet` is, and hidden with it — it is a footnote to a game the channel does not
 * run otherwise.
 */
export const fair: ChatCommand = {
  name: 'fair',
  aliases: ['честность', 'чесність'],
  available: (state) => state.rouletteEnabled,
  async run(ctx, deps) {
    const f = await deps.fairness();
    return {
      name: ctx.name,
      text: t(ctx.locale, 'fairNow', { hash: f.currentHash.slice(0, 16) }),
      // The revealed seed is what makes past spins checkable; without one yet, say so rather than
      // printing an empty field.
      hint: f.revealedSeed
        ? `${t(ctx.locale, 'fairLast')} ${f.revealedSeed.slice(0, 16)}…`
        : undefined,
    };
  },
};
