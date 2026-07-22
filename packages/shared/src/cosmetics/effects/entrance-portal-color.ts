import type { EntranceModule } from '../types';

/**
 * A colour for ENTRANCES — one free #rrggbb picker (stored in EquippedCosmetics.entranceColor) that
 * tints whichever entrance is equipped, for every entrance that has a colour to tint (the portal's
 * sparks, the astral web's threads and orbs). The CSS-only glitch has no colour and ignores it.
 *
 * It is NOT an entrance of its own — `upgrade: true` keeps it out of the category's equip/demo lists,
 * and it renders nothing itself; the equipped entrance does, just recoloured. `fx` is required by the
 * type but unused.
 *
 * Deliberately NOT gated by `requires` any more: it used to be an upgrade of the portal specifically,
 * but it now colours ANY entrance, so tying the purchase to owning one particular effect would be
 * wrong. The id is unchanged on purpose — everyone who already bought "Portal colour" keeps it and
 * simply gets the generalised version, with no migration and nothing to refund.
 */
export const entrancePortalColor: EntranceModule = {
  id: 'entrance-portal-color',
  type: 'entrance',
  costDust: 1000,
  upgrade: true,
  fx: 'entrance-color',
  labels: { name: 'shop.entranceColor', desc: 'shop.entranceColorDesc' },
};
