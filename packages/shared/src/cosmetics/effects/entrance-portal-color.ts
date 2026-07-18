import type { EntranceModule } from '../types';

/**
 * Upgrade of the Portal entrance: owning it unlocks a free #rrggbb colour picker for the portal's
 * sparks (stored in EquippedCosmetics.entranceColor, applied by ./entrance-portal). It is NOT an
 * entrance of its own — `upgrade: true` keeps it out of the category's equip/demo lists, and it
 * renders nothing itself (the base portal does, just recoloured). `fx` is required by the type but
 * unused; `requires` gates the purchase behind owning the portal.
 */
export const entrancePortalColor: EntranceModule = {
  id: 'entrance-portal-color',
  type: 'entrance',
  costDust: 1000,
  requires: 'entrance-portal',
  upgrade: true,
  fx: 'portal-color',
  labels: { name: 'shop.entrancePortalColor', desc: 'shop.entrancePortalColorDesc' },
};
