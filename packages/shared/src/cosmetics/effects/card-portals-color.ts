import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the PORTAL PAIR — one purchase, two pickers, one per mouth (see
 * card-blade-duel-color for why a two-sided effect is never sold as two upgrades). The cube keeps its
 * own colours: it belongs to neither side, and tinting it was the change that read as a mistake.
 */
export const cardPortalsColor: CardEffectModule = {
  id: 'card-portals-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-portals',
  upgrade: true,
  since: '2026-08-18',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorPortals', desc: 'shop.cardColorDualDesc' },
};
