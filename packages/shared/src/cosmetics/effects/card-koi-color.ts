import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the KOI — one purchase, two pickers (see card-blade-duel-color for why a
 * two-sided effect is never sold as two upgrades): colour 1 is the first fish, colour 2 the
 * second, and each wears the other's hue as its patches, so any two picks stay a matched pair.
 * The glow pools, head rims and patch colours all follow; the water and its rings stay water.
 */
export const cardKoiColor: CardEffectModule = {
  id: 'card-koi-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-koi',
  upgrade: true,
  since: '2026-08-28',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorKoi', desc: 'shop.cardColorDualDesc' },
};
