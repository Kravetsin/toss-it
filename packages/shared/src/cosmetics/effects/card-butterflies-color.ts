import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the BUTTERFLIES card effect. Bought separately from (and gated on owning) the
 * butterflies, it unlocks a #rrggbb picker whose value is stored per-effect in
 * EquippedCosmetics.cardEffectColors['card-butterflies'] and recolours only the butterflies. The shop
 * renders it INSIDE the butterflies' own card (see CardEffectModule.colorUpgrade), not as a separate
 * block — buying it merges the picker into that card.
 *
 * It is NOT a card effect of its own: `upgrade: true` keeps it out of the category's equip/demo lists
 * and it renders nothing (counts 0, no particle). `requires` gates the purchase on owning the effect.
 */
export const cardButterfliesColor: CardEffectModule = {
  id: 'card-butterflies-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-butterflies',
  upgrade: true,
  since: '2026-07-24',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorButterflies', desc: 'shop.cardColorDesc' },
};
