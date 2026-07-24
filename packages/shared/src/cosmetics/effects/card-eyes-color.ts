import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the EYES card effect. Bought separately from (and gated on owning) the eyes, it
 * unlocks a #rrggbb picker stored per-effect in EquippedCosmetics.cardEffectColors['card-eyes'] and
 * recolours only the eyes. Rendered INSIDE the eyes' own card (see CardEffectModule.colorUpgrade).
 * Same shape as card-butterflies-color.
 */
export const cardEyesColor: CardEffectModule = {
  id: 'card-eyes-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-eyes',
  upgrade: true,
  since: '2026-07-24',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorEyes', desc: 'shop.cardColorDesc' },
};
