import { BET, maxBet, parseColor, PAYOUT } from '@tmw/shared';
import { t } from '../strings';
import type { ChatCommand } from './types';

/** "Everything I'm allowed", in the three languages the bot answers in. */
const ALL_WORDS = new Set(['all', 'max', 'всё', 'все', 'усе', 'усі', 'макс']);

/**
 * `!bet <amount> <colour>` — the dust wheel from chat, in either order.
 *
 * Cooldown 0, and there is none in the engine either. The one that used to be there produced
 * exactly the traffic it was meant to prevent: a refusal costs the bot a chat message just as an
 * answer does, so throttling only turned bets into "too fast, wait 40s" — and a player who cannot
 * see their own timer just types again to find out. The send budget is defended where it lives,
 * in the chat module's per-channel and per-account windows.
 *
 * A bare `!bet` answers with the syntax and nothing else. The sign-up nudge lives where it is
 * actually useful — on `broke`, where someone just found out they cannot play.
 */
export const bet: ChatCommand = {
  name: 'bet',
  aliases: ['ставка', 'roll'],
  available: (state) => state.rouletteEnabled,
  cooldownMs: 0,
  async run(ctx, deps) {
    // The REAL gate. `available()` only feeds the !tossit listing and the dashboard catalog —
    // runCommand never consults it, which is why every other switchable command re-checks in its
    // own dep. Without this the wheel answered in channels that had never switched it on.
    if (!deps.commandState(ctx.channelId).rouletteEnabled) return null;

    // Either order. "!bet red 100" is at least as natural as "!bet 100 red", and someone typing
    // mid-stream should not have to remember which way round we wanted it.
    let colorArg: string | undefined;
    let amountArg: string | undefined;
    for (const arg of ctx.args) {
      if (!colorArg && parseColor(arg)) colorArg = arg;
      else if (!amountArg) amountArg = arg;
    }

    // Bare call: show the SHAPE of the command. It used to answer with the balance, the cap and
    // the odds at once, which explained everything except how to place a bet — and the balance is
    // what !balance is for.
    if (!amountArg && !colorArg) return { name: ctx.name, text: t(ctx.locale, 'betUsage') };

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
      case 'disabled':
        return null;
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
          spin: { color: res.resultColor, won },
        };
      }
    }
  },
};
