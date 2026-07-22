import type { FrameModule } from '../types';

/**
 * Top of the chat-message ladder (runner → twin runners → this). Still the shared ring, but a single
 * WIDE arc that ramps ember → flame → white-hot at the leading edge and cools back to ash, dying out
 * before the halfway mark — so the ring never closes and reads as something that swept past rather
 * than a light doing laps. Its glow breathes on a cycle deliberately unrelated to the lap time, which
 * is what makes it feel alive instead of mechanical.
 */
export const frameDragonBreath: FrameModule = {
  id: 'frame-dragon-breath',
  type: 'frame',
  // EARNED, not bought: 2000 chat messages on the account (see CosmeticItem.earn / the equip gate).
  costDust: 0,
  earn: { metric: 'messages', count: 2000 },
  className: 'frame-fx-dragon-breath',
  labels: { name: 'shop.frameDragonBreath', desc: 'shop.frameDragonBreathDesc' },
  css: `
.frame-fx-dragon-breath::after {
  background: conic-gradient(from var(--frame-ang),
    transparent 0 4%,
    #5c0f02 8%,
    #c92a0c 16%,
    #ff6a00 24%,
    #ffb347 30%,
    #fff3c4 34%,
    #ff6a00 39%,
    #c92a0c 44%,
    transparent 50% 100%);
  animation: frame-run 5s linear infinite, frame-dragon-breath-pulse 2.4s ease-in-out infinite;
}
@keyframes frame-dragon-breath-pulse {
  0%, 100% {
    filter: drop-shadow(0 0 2px rgba(255, 106, 0, 0.35));
  }
  50% {
    filter: drop-shadow(0 0 5px rgba(255, 80, 0, 0.7));
  }
}
`,
};
