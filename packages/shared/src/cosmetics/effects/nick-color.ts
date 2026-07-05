import type { ColorModule } from '../types';

/**
 * Free-form nickname color. Unlike the other cosmetics it has no CSS or particles — owning it
 * unlocks a color picker; the picked #rrggbb is stored in `equipped.nickColor` and applied as the
 * text color wherever the name is rendered.
 */
export const nickColor: ColorModule = {
  id: 'nick-color',
  type: 'nick_color',
  costDust: 1000,
  labels: { name: 'shop.nickColor', desc: 'shop.nickColorDesc' },
};
