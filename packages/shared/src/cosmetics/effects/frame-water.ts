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
 *
 * The crest peaks near-white and a second animation shimmers the layer: cyan alone disappears over a
 * bright stream, and a 7s sweep with nothing else moving stops registering as motion within seconds.
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
    radial-gradient(ellipse 40% 64% at var(--water-x) 100%,
      rgba(240, 255, 255, 1),
      rgba(108, 222, 252, 0.9) 34%,
      rgba(28, 142, 192, 0.52) 62%,
      transparent 82%),
    radial-gradient(ellipse 125% 44% at 50% 100%,
      rgba(30, 128, 168, 0.58),
      transparent 70%);
  /* The tide owns --water-x, the shimmer owns opacity: two animations may not share a property. */
  animation:
    frame-water-tide 5.5s ease-in-out infinite,
    frame-water-shimmer 2.2s ease-in-out infinite;
}
/* Water lights the card from below, on the shimmer's own cycle. */
.frame-fx-water::before {
  box-shadow: inset 0 -7px 12px -5px rgba(124, 224, 250, 0.5);
  animation: frame-water-shimmer 2.2s ease-in-out infinite;
}
@keyframes frame-water-shimmer {
  0%, 100% {
    opacity: 0.82;
  }
  45% {
    opacity: 1;
  }
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
