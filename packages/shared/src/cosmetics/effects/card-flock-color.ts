import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the MURMURATION card effect — same shape as card-code-rain-color: bought
 * separately, gated on owning the flock, stores its own #rrggbb in
 * EquippedCosmetics.cardEffectColors. It repaints the flock's light — glow pool, ghosts, dust —
 * and the bright bird stroke is derived from the hue, so a recolour keeps its hot leading edge.
 */
export const cardFlockColor: CardEffectModule = {
  id: 'card-flock-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-flock',
  upgrade: true,
  since: '2026-08-28',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorFlock', desc: 'shop.cardColorDesc' },
};
