import type { GiftTarget } from '@tmw/shared';
import { json } from './http';

/** Accounts whose login or name STARTS with the query — enough to find someone you know, useless
 *  for walking the user table. */
export function searchGiftTargets(q: string): Promise<GiftTarget[]> {
  return fetch(`/api/users/search?q=${encodeURIComponent(q)}`).then((r) => json<GiftTarget[]>(r));
}

/** Hand dust to a PICKED account. Never takes a typed name: a gift cannot be taken back. */
export function giftDust(userId: string, amount: number): Promise<{ amount: number }> {
  return fetch('/api/dust/gift', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId, amount }),
  }).then((r) => json<{ amount: number }>(r));
}
