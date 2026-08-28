import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the RUNNER — one purchase, two pickers (see card-blade-duel-color for why
 * a two-sided effect is never sold as two upgrades): colour 1 repaints the cube, its edge and glow;
 * colour 2 repaints the world — the neon floor and the spikes share one hue because they are one
 * level. Stored in EquippedCosmetics.cardEffectColors / cardEffectColors2.
 */
export const cardRunnerColor: CardEffectModule = {
  id: 'card-runner-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-runner',
  upgrade: true,
  since: '2026-08-28',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorRunner', desc: 'shop.cardColorDualDesc' },
};
