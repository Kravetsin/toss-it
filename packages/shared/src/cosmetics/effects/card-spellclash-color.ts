import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the SPELL DUEL — one purchase, two pickers, one per beam (see
 * card-blade-duel-color for why a two-sided effect is never sold as two upgrades). The weld between
 * them keeps its warm white: it belongs to neither side, and tinting it is what turns the contact
 * from a meeting place into one duellist's property (see card-spellclash's header).
 */
export const cardSpellclashColor: CardEffectModule = {
  id: 'card-spellclash-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-spellclash',
  upgrade: true,
  since: '2026-08-21',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorSpellclash', desc: 'shop.cardColorDualDesc' },
};
