import type { SealModule } from '../types';

/**
 * The colour UPGRADE for the EYE seal. EARNED, not bought — unlocked at 250 hours of watch time (the
 * seal itself comes first, at 100 hours). Owning it turns on a #rrggbb picker whose value is stored
 * per-seal in EquippedCosmetics.sealColors['seal-eye'] and recolours only that seal (see
 * SealModule.colorUpgrade); the shop renders the picker INSIDE the eye seal's row.
 *
 * Not a seal of its own: `upgrade: true` keeps it out of the category's equip/demo lists and it renders
 * nothing (className ''). The gate is live on the earn metric, so no purchase/ownership row exists.
 */
export const sealEyeColor: SealModule = {
  id: 'seal-eye-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'watchMinutes', count: 15_000 },
  upgrade: true,
  since: '2026-07-24',
  className: '',
  labels: { name: 'shop.sealColorEye', desc: 'shop.sealColorDesc' },
};
