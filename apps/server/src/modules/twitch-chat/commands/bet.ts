import { BET, maxBet, parseColor, PAYOUT } from '@tmw/shared';
import { t } from '../strings';
import type { ChatCommand } from './types';

/** "Everything I'm allowed", in the three languages the bot answers in. */
const ALL_WORDS = new Set(['all', 'max', 'всё', 'все', 'усе', 'усі', 'макс']);

/**
 * `!bet <amount> <colour>` — the dust wheel from chat, in either order.
 *
 * Cooldown 0 here because the engine owns the real one (60s, shared with the site so neither door
 * is the cheap way past the other). The registry's 15s would only ever hide the answer to a bet
 * that already happened, which is the worst of both.
 *
 * A bare `!bet` is the sign-up surface: for someone with no account it states the balance we are
 * holding for them and what a first login adds. Deliberately phrased as a balance, not as a stake —
 * "bet more, register for 1000" is how a casino asks for a deposit, and the same fact told as a
 * gift is just as true.
 */
export const bet: ChatCommand = {
  name: 'bet',
  aliases: ['ставка', 'roll'],
  available: (state) => state.rouletteEnabled,
  cooldownMs: 0,
  async run(ctx, deps) {
    // Either order. "!bet red 100" is at least as natural as "!bet 100 red", and someone typing
    // mid-stream should not have to remember which way round we wanted it.
    let colorArg: string | undefined;
    let amountArg: string | undefined;
    for (const arg of ctx.args) {
      if (!colorArg && parseColor(arg)) colorArg = arg;
      else if (!amountArg) amountArg = arg;
    }

    if (!amountArg && !colorArg) {
      const s = await deps.betState(ctx.twitchId);
      const text = t(ctx.locale, s.max > 0 ? 'betReady' : 'betBroke', {
        max: s.max,
        green: PAYOUT.green,
      });
      return {
        name: ctx.name,
        text,
        dust: s.balance,
        hint: s.registered ? undefined : 'toss-it.org',
      };
    }

    const color = parseColor(colorArg ?? '');
    if (!color || !amountArg) return { name: ctx.name, text: t(ctx.locale, 'betUsage') };

    // `all` means "the most I'm allowed", not "everything I have" — the cap is a protection, and
    // reading it as the balance would hand the whole pile over in one word. Spelled without ё too,
    // because most keyboards are.
    const stake = ALL_WORDS.has(amountArg.toLowerCase())
      ? maxBet((await deps.betState(ctx.twitchId)).balance)
      : Number.parseInt(amountArg, 10);
    if (!Number.isFinite(stake) || stake <= 0) {
      return { name: ctx.name, text: t(ctx.locale, 'betUsage') };
    }

    const res = await deps.bet({ channelId: ctx.channelId, twitchId: ctx.twitchId, stake, color });
    switch (res.kind) {
      case 'cooldown':
        return { name: ctx.name, text: t(ctx.locale, 'betWait', { n: res.waitS }) };
      case 'tooSmall':
        return { name: ctx.name, text: t(ctx.locale, 'betMin', { n: BET.min }) };
      case 'overCap':
        return { name: ctx.name, text: t(ctx.locale, 'betMax', { n: res.max }) };
      case 'broke':
        return {
          name: ctx.name,
          text: t(ctx.locale, 'betBroke'),
          dust: res.balance,
          hint: res.registered ? undefined : 'toss-it.org',
        };
      case 'done': {
        const won = res.payout > 0;
        // The number carries the sign so the outcome reads at a glance mid-stream: the colour that
        // came up, then what it cost or paid. Net, not gross — "+500" on a won 500 at ×2, because
        // the stake coming back is not winnings.
        return {
          name: ctx.name,
          text:
            t(ctx.locale, `color_${res.resultColor}`) + (won ? ` ×${PAYOUT[res.betColor]}` : ''),
          dust: won ? res.payout - res.stake : -res.stake,
          // The overlay plays this out before revealing the two fields above. Chat gets them
          // immediately — a second and a half is not a spoiler, and Twitch's own delay is longer.
          spin: { color: res.resultColor },
        };
      }
    }
  },
};
