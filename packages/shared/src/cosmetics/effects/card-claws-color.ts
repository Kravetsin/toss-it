import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the CLAWS card effect — same shape as card-butterflies-color: bought
 * separately, gated on owning the claws, stores its own #rrggbb in
 * EquippedCosmetics.cardEffectColors['card-claws'] and renders inside the effect's own shop card.
 *
 * What it repaints is the light the wound BLEEDS — the glow and the void's ramp — not the stars inside
 * it, which stay white on purpose (see card-claws): a tinted starfield stops reading as a hole and
 * starts reading as a pane of coloured glass.
 */
export const cardClawsColor: CardEffectModule = {
  id: 'card-claws-color',
  type: 'card_effect',
  costDust: 1000,
  requires: 'card-claws',
  upgrade: true,
  since: '2026-08-07',
  className: '',
  counts: { web: 0, overlayCard: 0, overlayChat: 0 },
  labels: { name: 'shop.cardColorClaws', desc: 'shop.cardColorDesc' },
};
