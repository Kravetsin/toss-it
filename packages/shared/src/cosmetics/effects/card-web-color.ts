import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the ASTRAL THREAD card effect — same shape as card-hextech-color: bought
 * separately, gated on owning the web, stores its own #rrggbb in
 * EquippedCosmetics.cardEffectColors['card-web'] and renders inside the effect's own shop card.
 *
 * Reaches the effect through `render()`'s own `color` argument (card-web is a canvas effect, not
 * CSS particles), not through `--cos-fx-tint` — see card-web's render for where it's consumed.
 */
export const cardWebColor: CardEffectModule = {
  id: 'card-web-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-web',
  upgrade: true,
  since: '2026-08-09',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorWeb', desc: 'shop.cardColorDesc' },
};
