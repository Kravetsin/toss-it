import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the HEXTECH card effect — same shape as card-butterflies-color: bought
 * separately, gated on owning the lattice, stores its own #rrggbb in
 * EquippedCosmetics.cardEffectColors['card-hextech'] and renders inside the effect's own shop card.
 *
 * Unlike the butterflies, the colour reaches the effect through the LAYER (`--cos-fx-tint`) rather
 * than through each particle, because the lattice and the running charge live on the layer's own
 * pseudo-elements — see card-hextech.
 */
export const cardHextechColor: CardEffectModule = {
  id: 'card-hextech-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-hextech',
  upgrade: true,
  since: '2026-08-07',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorHextech', desc: 'shop.cardColorDesc' },
};
