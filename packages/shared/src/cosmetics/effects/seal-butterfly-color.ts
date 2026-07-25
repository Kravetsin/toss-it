import type { SealModule } from '../types';

/**
 * The colour UPGRADE for the BUTTERFLY seal. Like the seal itself it is EARNED, not bought — unlocked
 * at 2000 chat messages (the seal comes first, at 1000). Owning it turns on a #rrggbb picker whose
 * value is stored per-seal in EquippedCosmetics.sealColors['seal-butterfly'] and recolours only that
 * seal (see SealModule.colorUpgrade); the shop renders the picker INSIDE the butterfly seal's row.
 *
 * Not a seal of its own: `upgrade: true` keeps it out of the category's equip/demo lists and it renders
 * nothing (className ''). The gate is live on the earn metric, so no purchase/ownership row exists.
 */
export const sealButterflyColor: SealModule = {
  id: 'seal-butterfly-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'messages', count: 2000 },
  upgrade: true,
  since: '2026-07-24',
  className: '',
  labels: { name: 'shop.sealColorButterfly', desc: 'shop.sealColorDesc' },
};
