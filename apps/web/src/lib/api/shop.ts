import type { CosmeticStateResponse, EquippedCosmetics } from '@tmw/shared';
import { json } from './http';

/** Buy a cosmetic with stardust. */
export function buyCosmetic(itemId: string): Promise<CosmeticStateResponse> {
  return fetch('/api/cosmetics/buy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ itemId }),
  }).then((r) => json<CosmeticStateResponse>(r));
}

/**
 * Equip/unequip cosmetics: a value sets that slot, null removes it, an omitted key leaves it alone.
 * Typed as the equipped state itself so a new cosmetic slot can never drift out of this client.
 */
export function equipCosmetic(patch: EquippedCosmetics): Promise<CosmeticStateResponse> {
  return fetch('/api/cosmetics/equip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => json<CosmeticStateResponse>(r));
}
