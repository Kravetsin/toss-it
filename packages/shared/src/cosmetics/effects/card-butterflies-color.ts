import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the butterflies card effect — the first upgrade in the card-effect category.
 * Buying it unlocks a free #rrggbb picker (stored in EquippedCosmetics.cardEffectColor) that recolours
 * whichever COLOURABLE card effect is equipped; for now that is only card-butterflies (see its
 * `colorable` flag). A non-colourable effect ignores the stored colour, exactly like
 * entrance-portal-color's tint is ignored by the glitch entrance.
 *
 * It is NOT a card effect of its own: `upgrade: true` keeps it out of the category's equip/demo lists
 * and it renders nothing (counts 0, no particle — cardEffectLayerClass returns '' for it). `requires`
 * gates the purchase on owning the butterflies effect it colours. Modelled on entrance-portal-color.
 */
export const cardButterfliesColor: CardEffectModule = {
  id: 'card-butterflies-color',
  type: 'card_effect',
  costDust: 1500,
  requires: 'card-butterflies',
  upgrade: true,
  since: '2026-07-24',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColor', desc: 'shop.cardColorDesc' },
};
