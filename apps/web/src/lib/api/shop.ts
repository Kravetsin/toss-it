import type { CosmeticStateResponse } from '@tmw/shared';
import { json } from './http';

/** Buy a cosmetic with stardust. */
export function buyCosmetic(itemId: string): Promise<CosmeticStateResponse> {
  return fetch('/api/cosmetics/buy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ itemId }),
  }).then((r) => json<CosmeticStateResponse>(r));
}

/** Equip/unequip cosmetics. nickColor: #rrggbb to set, null to remove. */
export function equipCosmetic(patch: { nickColor: string | null }): Promise<CosmeticStateResponse> {
  return fetch('/api/cosmetics/equip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => json<CosmeticStateResponse>(r));
}
