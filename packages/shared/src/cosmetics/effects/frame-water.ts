import type { FrameModule } from '../types';

/**
 * First of the schematic frames: light on ONE edge instead of a ring, so it can never surround the
 * text and compete with it — which is what killed the drawn-ornament attempts on the chat bubble.
 *
 * Two things are load-bearing. The paint is RADIAL and centred on the bottom edge, not a band of
 * fixed height: a band ends in a hard horizontal cut on the side borders, radial glow fades out in
 * every direction and has no end to see. And the swell moves by animating a gradient STOP rather
 * than an image — a soft ramp is resampled per pixel, so a hundredth of a pixel reads as a change in
 * brightness instead of the whole-pixel jump that made the old creeping vine stutter.
 */
export const frameWater: FrameModule = {
  id: 'frame-water',
  type: 'frame',
  // EARNED, not bought: 4500 watch-minutes (75h) account-wide.
  costDust: 0,
  earn: { metric: 'watchMinutes', count: 4500 },
  since: '2026-07-23',
  className: 'frame-fx-water',
  labels: { name: 'shop.frameWater', desc: 'shop.frameWaterDesc' },
  css: `
@property --water-x {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 50%;
}
.frame-fx-water::after {
  background:
    radial-gradient(ellipse 40% 62% at var(--water-x) 100%,
      rgba(150, 230, 250, 0.95),
      rgba(60, 170, 205, 0.42) 44%,
      transparent 74%),
    radial-gradient(ellipse 125% 42% at 50% 100%,
      rgba(35, 135, 170, 0.38),
      transparent 70%);
  animation: frame-water-tide 7s ease-in-out infinite;
}
/* Back and forth rather than round: a crest that reappears on the far side would read as another
   runner, and the whole point of this family is that nothing laps the card. */
@keyframes frame-water-tide {
  0%, 100% {
    --water-x: 16%;
  }
  50% {
    --water-x: 84%;
  }
}
`,
};
