import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the BLADE DUEL — one purchase, TWO pickers, because the duel is only legible
 * while its two sides differ (see CardEffectModule.dualColor). The first colour is stored in
 * EquippedCosmetics.cardEffectColors, the second in cardEffectColors2, both under the effect's id.
 *
 * Selling them separately was the alternative and it is a worse deal in both directions: one blade
 * recoloured and the other stuck on the default is the state nobody wants to pay to be in.
 */
export const cardBladeDuelColor: CardEffectModule = {
  id: 'card-blade-duel-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-blade-duel',
  upgrade: true,
  since: '2026-08-18',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorBlades', desc: 'shop.cardColorDualDesc' },
};
