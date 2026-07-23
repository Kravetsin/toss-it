import type { FrameModule } from '../types';

/**
 * A single coal wandering along the bottom edge: it burns in one spot, dies out completely, and
 * comes back somewhere else. Nothing ever slides — the position only changes while the alpha sits
 * at zero, so the move happens in the dark and you never catch it travelling. That is the whole
 * trick, and it is why this can move without the pixel-stepping that sinks slow translation.
 *
 * A dim static coal and a wash keep the edge from going fully empty between burns. Radial paint
 * (never a fixed-height band) so it fades out on the side borders instead of ending in a cut.
 */
export const frameEmbers: FrameModule = {
  id: 'frame-embers',
  type: 'frame',
  // EARNED, not bought: 3000 watch-minutes (50h) account-wide.
  costDust: 0,
  earn: { metric: 'watchMinutes', count: 3000 },
  since: '2026-07-23',
  className: 'frame-fx-embers',
  labels: { name: 'shop.frameEmbers', desc: 'shop.frameEmbersDesc' },
  css: `
@property --ember-x {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 20%;
}
@property --ember-a {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}
.frame-fx-embers::after {
  background:
    radial-gradient(ellipse 25% 55% at var(--ember-x) 100%,
      rgba(255, 146, 46, var(--ember-a)),
      rgba(150, 46, 8, calc(var(--ember-a) * 0.34)) 46%,
      transparent 74%),
    radial-gradient(ellipse 22% 44% at 78% 100%,
      rgba(190, 74, 16, 0.3),
      transparent 72%),
    radial-gradient(ellipse 118% 36% at 50% 100%,
      rgba(118, 32, 4, 0.32),
      transparent 72%);
  animation: frame-embers-wander 12s ease-in-out infinite;
}
/* Three burns per lap. Every move (32→36%, 68→72%) happens between two keyframes that both pin the
   alpha at 0, so the coal is invisible while it relocates and never appears to slide. */
@keyframes frame-embers-wander {
  0% {
    --ember-a: 0;
    --ember-x: 20%;
  }
  7% {
    --ember-a: 0.95;
    --ember-x: 20%;
  }
  26% {
    --ember-a: 0.85;
    --ember-x: 20%;
  }
  32% {
    --ember-a: 0;
    --ember-x: 20%;
  }
  36% {
    --ember-a: 0;
    --ember-x: 57%;
  }
  43% {
    --ember-a: 0.95;
    --ember-x: 57%;
  }
  62% {
    --ember-a: 0.82;
    --ember-x: 57%;
  }
  68% {
    --ember-a: 0;
    --ember-x: 57%;
  }
  72% {
    --ember-a: 0;
    --ember-x: 86%;
  }
  79% {
    --ember-a: 0.9;
    --ember-x: 86%;
  }
  94% {
    --ember-a: 0.8;
    --ember-x: 86%;
  }
  100% {
    --ember-a: 0;
    --ember-x: 86%;
  }
}
`,
};
