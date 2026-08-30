import type { RouletteColor } from '@tmw/shared';
import { json } from './http';

export interface RouletteState {
  balance: number;
  /** 0 = cannot play right now; the panel says so instead of offering a refused spin. */
  max: number;
  min: number;
  payouts: Record<RouletteColor, number>;
}

/** The server's verdict. The slot is what the animation must land on — it never decides anything. */
export interface SpinDone {
  kind: 'done';
  stake: number;
  betColor: RouletteColor;
  slot: number;
  resultColor: RouletteColor;
  /** Total returned, stake included; 0 = lost. */
  payout: number;
  balance: number;
}

export type SpinRefusal =
  | { kind: 'tooSmall'; min: number }
  | { kind: 'overCap'; max: number; balance: number }
  | { kind: 'broke'; balance: number; registered: boolean };

export type SpinResponse = { ok: true; outcome: SpinDone } | { ok: false; outcome: SpinRefusal };

export function fetchRouletteState(): Promise<RouletteState> {
  return fetch('/api/roulette').then((r) => json<RouletteState>(r));
}

export function spin(stake: number, color: RouletteColor): Promise<SpinResponse> {
  return fetch('/api/roulette/bet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ stake, color }),
  }).then((r) => json<SpinResponse>(r));
}
