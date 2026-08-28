import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for OUTRUN — one purchase, two pickers (see card-blade-duel-color for why a
 * two-sided effect is never sold as two upgrades): colour 1 is the NEON — grid, sky, sun body and
 * tail lamps — and colour 2 the cool counterpoint — ridge lines and the sun's top. The mountains'
 * dark tones are derived from colour 1, so any two picks stay one landscape, not a collage.
 */
export const cardOutrunColor: CardEffectModule = {
  id: 'card-outrun-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-outrun',
  upgrade: true,
  since: '2026-08-28',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorOutrun', desc: 'shop.cardColorDualDesc' },
};
