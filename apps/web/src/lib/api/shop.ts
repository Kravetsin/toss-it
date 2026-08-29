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

/** Buy a display name. Charged at the rename itself — there is no token to own. */
export function buyDisplayName(name: string): Promise<CosmeticStateResponse> {
  return fetch('/api/cosmetics/name', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then((r) => json<CosmeticStateResponse>(r));
}

/** Go back to the name the provider gives. Free. */
export function clearDisplayName(): Promise<CosmeticStateResponse> {
  return fetch('/api/cosmetics/name', { method: 'DELETE' }).then((r) =>
    json<CosmeticStateResponse>(r),
  );
}

/**
 * Equip/unequip cosmetics: a value sets that slot, null removes it, an omitted key leaves it alone.
 * Typed as the equipped state itself so a new cosmetic slot can never drift out of this client — except
 * the per-effect colour map, whose values may be null here (removing one effect's colour).
 */
export function equipCosmetic(
  patch: Omit<
    EquippedCosmetics,
    'cardEffectColors' | 'cardEffectColors2' | 'sealColors' | 'frameColors'
  > & {
    cardEffectColors?: Record<string, string | null>;
    cardEffectColors2?: Record<string, string | null>;
    sealColors?: Record<string, string | null>;
    frameColors?: Record<string, string | null>;
  },
): Promise<CosmeticStateResponse> {
  return fetch('/api/cosmetics/equip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  }).then((r) => json<CosmeticStateResponse>(r));
}
