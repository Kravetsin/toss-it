import type { AdminPromoCode, PromoRedeemResult } from '@tmw/shared';
import { json } from './http';

export function redeemPromo(code: string): Promise<PromoRedeemResult> {
  return fetch(`/api/promo/${encodeURIComponent(code)}/redeem`, { method: 'POST' }).then((r) =>
    json<PromoRedeemResult>(r),
  );
}

export function listPromoCodes(): Promise<AdminPromoCode[]> {
  return fetch('/api/admin/promo').then((r) => json<AdminPromoCode[]>(r));
}

export function createPromoCodes(
  count: number,
  note: string,
  grant = 'founder',
): Promise<{ codes: string[] }> {
  return fetch('/api/admin/promo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ count, note, grant }),
  }).then((r) => json<{ codes: string[] }>(r));
}
