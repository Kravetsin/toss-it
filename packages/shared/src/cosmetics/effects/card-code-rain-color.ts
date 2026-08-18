import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the CODE RAIN card effect — same shape as card-web-color: bought separately,
 * gated on owning the rain, stores its own #rrggbb in EquippedCosmetics.cardEffectColors and renders
 * inside the effect's own shop card. The head colour is derived from the chosen hue rather than
 * stored, so a recolour keeps its bright leading glyph (see card-code-rain's `scene`).
 */
export const cardCodeRainColor: CardEffectModule = {
  id: 'card-code-rain-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-code-rain',
  upgrade: true,
  since: '2026-08-18',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorCode', desc: 'shop.cardColorDesc' },
};
