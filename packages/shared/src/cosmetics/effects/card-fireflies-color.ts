import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the FIREFLIES card effect — same shape as card-code-rain-color: bought
 * separately, gated on owning the fireflies, stores its own #rrggbb in
 * EquippedCosmetics.cardEffectColors. It repaints the LIGHT (flash glow and core); the grass and
 * the dark meadow keep their own colours.
 */
export const cardFirefliesColor: CardEffectModule = {
  id: 'card-fireflies-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-fireflies',
  upgrade: true,
  since: '2026-08-28',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorFireflies', desc: 'shop.cardColorDesc' },
};
