import type { AdminPromoCode, AdminPromoRedemption, PromoRedeemResult } from '@tmw/shared';
import { json } from './http';

export function redeemPromo(code: string): Promise<PromoRedeemResult> {
  return fetch(`/api/promo/${encodeURIComponent(code)}/redeem`, { method: 'POST' }).then((r) =>
    json<PromoRedeemResult>(r),
  );
}

export function listPromoCodes(): Promise<AdminPromoCode[]> {
  return fetch('/api/admin/promo').then((r) => json<AdminPromoCode[]>(r));
}

export interface CreatePromoOptions {
  count: number;
  note: string;
  grant: string;
  /** Required for amount-carrying grants ('stardust'); ignored otherwise. */
  grantAmount?: number;
  maxUses: number;
}

export function createPromoCodes(opts: CreatePromoOptions): Promise<{ codes: string[] }> {
  return fetch('/api/admin/promo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts),
  }).then((r) => json<{ codes: string[] }>(r));
}

export function listPromoRedemptions(code: string): Promise<AdminPromoRedemption[]> {
  return fetch(`/api/admin/promo/${encodeURIComponent(code)}/redemptions`).then((r) =>
    json<AdminPromoRedemption[]>(r),
  );
}

export function revokePromoCode(code: string): Promise<{ ok: true }> {
  return fetch(`/api/admin/promo/${encodeURIComponent(code)}/revoke`, { method: 'POST' }).then(
    (r) => json<{ ok: true }>(r),
  );
}
