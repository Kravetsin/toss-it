import type { CardEffectModule } from '../types';

/**
 * The colour UPGRADE for the RUNNER card effect — same shape as card-code-rain-color: bought
 * separately, gated on owning the runner, stores its own #rrggbb in
 * EquippedCosmetics.cardEffectColors. It repaints the cube, its edge highlight and its glow; the
 * obstacles keep their hazard colour, because the cube is the viewer and the spikes are the world.
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
  labels: { name: 'shop.cardColorRunner', desc: 'shop.cardColorDesc' },
};
