import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the RIPPLES card effect — same shape as card-code-rain-color: bought
 * separately, gated on owning the ripples, stores its own #rrggbb in
 * EquippedCosmetics.cardEffectColors. It repaints the LIGHT — the falling motes, splashes and the
 * flare each glint takes as a ring passes — while the resting water stays neutral.
 */
export const cardRipplesColor: CardEffectModule = {
  id: 'card-ripples-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-ripples',
  upgrade: true,
  since: '2026-08-28',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorRipples', desc: 'shop.cardColorDesc' },
};
