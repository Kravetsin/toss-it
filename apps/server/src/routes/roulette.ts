import type { FastifyInstance } from 'fastify';
import { BET, PAYOUT, parseColor, type RouletteColor } from '@tmw/shared';
import { requireUser } from '../auth';
import { betState, fairness, placeBet, type BetOutcome } from '../roulette';

/** What the site's wheel needs to render itself before anyone bets. */
export interface RouletteStateResponse {
  balance: number;
  /** 0 = cannot play; the panel says so instead of offering a spin that will be refused. */
  max: number;
  min: number;
  payouts: Record<RouletteColor, number>;
  cooldownS: number;
  /** Hash of the seed spinning right now, published before it is used. */
  fairHash: string;
}

export type RouletteSpinResponse =
  | { ok: true; outcome: Extract<BetOutcome, { kind: 'done' }> }
  | { ok: false; outcome: Exclude<BetOutcome, { kind: 'done' }> };

/**
 * The site door onto the wheel. Deliberately thin: every limit, the balance and the 60s cooldown
 * live in the engine, shared with `!bet`, so opening a second door cannot become the cheap way
 * past the first one's rules.
 *
 * Site bets belong to no channel — `channelId` is null in the audit row.
 */
export function registerRouletteRoutes(app: FastifyInstance): void {
  app.get('/api/roulette', async (req, reply): Promise<RouletteStateResponse | void> => {
    const user = await requireUser(req, reply);
    if (!user) return;
    const [state, fair] = await Promise.all([
      betState({ platform: 'tossit', platformUserId: user.id, userId: user.id }),
      fairness(),
    ]);
    return {
      balance: state.balance,
      max: state.max,
      min: BET.min,
      payouts: PAYOUT,
      cooldownS: 60,
      fairHash: fair.currentHash,
    };
  });

  app.post<{ Body: { stake?: number; color?: string } }>(
    '/api/roulette/bet',
    async (req, reply): Promise<RouletteSpinResponse | void> => {
      const user = await requireUser(req, reply);
      if (!user) return;
      const color = parseColor(String(req.body?.color ?? ''));
      const stake = Number(req.body?.stake);
      if (!color || !Number.isInteger(stake) || stake <= 0) {
        return reply.code(400).send({ error: 'Нужны ставка и цвет' });
      }
      const outcome = await placeBet({
        door: 'site',
        channelId: null,
        // The engine keys pending dust by PLATFORM id; a site better always has an account, so the
        // account id is both the identity and the wallet, and no pending row is ever involved.
        platform: 'tossit',
        platformUserId: user.id,
        userId: user.id,
        stake,
        color,
      });
      return outcome.kind === 'done' ? { ok: true, outcome } : { ok: false, outcome };
    },
  );
}
