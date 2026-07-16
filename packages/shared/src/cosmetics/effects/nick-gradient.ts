import type { ColorModule } from '../types';

/**
 * Two-stop nickname gradient — an upgrade on top of 'nick-color': the base color becomes the first
 * stop, this unlocks the second (`equipped.nickColor2`). Like nick-color it has no CSS of its own;
 * the ramp is built per user by `nickRender` (../nick) since the stops are free-form hexes.
 *
 * The angle is fixed horizontal on purpose — it is the one knob that reliably produces bad taste
 * (45° rainbows), and short names read best left-to-right. Same call as the channel theme, where
 * viewers pick hues and we keep lightness.
 */
export const nickGradient: ColorModule = {
  id: 'nick-gradient',
  type: 'nick_color',
  // Deliberately cheap for what it is: as an upgrade it competes with the card effects (2500+),
  // and next to a particle swarm a second stop loses that comparison every time. Priced as an
  // add-on to nick-color, not as a rival to them — the whole colour ladder lands at 3000.
  costDust: 1000,
  requires: 'nick-color',
  labels: { name: 'shop.nickGradient', desc: 'shop.nickGradientDesc' },
};
