import type { FrameModule } from '../types';

/**
 * Green light filtering down from overhead: the only schematic frame that lives on the TOP edge, so
 * it reads as something above the card rather than under it. Deliberately not called a vine — the
 * drawn vines are their own family on the watch-time axis, and reusing the name would make two
 * unrelated things look like rungs of one ladder.
 *
 * Two patches drift in OPPOSITE directions off a single animated variable (the second one is derived
 * with calc), so they pass each other instead of marching in step — one shared animation, but the
 * motion never looks like a single object sliding.
 *
 * The patches carry a near-WHITE core: a muted green over someone's gameplay has no contrast left,
 * and the core is the part that survives a bright stream. The drift alone was also too slow to read
 * as motion (13s), so a second animation flickers the whole layer — light through moving leaves.
 */
export const frameCanopy: FrameModule = {
  id: 'frame-canopy',
  type: 'frame',
  // EARNED, not bought: 1500 watch-minutes (25h) account-wide — the entry rung of the watch axis.
  costDust: 0,
  earn: { metric: 'watchMinutes', count: 1500 },
  since: '2026-07-23',
  className: 'frame-fx-canopy',
  labels: { name: 'shop.frameCanopy', desc: 'shop.frameCanopyDesc' },
  css: `
@property --canopy-x {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 30%;
}
.frame-fx-canopy::after {
  background:
    radial-gradient(ellipse 32% 60% at var(--canopy-x) 0%,
      rgba(238, 255, 216, 1),
      rgba(122, 226, 112, 0.8) 42%,
      transparent 76%),
    radial-gradient(ellipse 27% 52% at calc(100% - var(--canopy-x) * 0.72) 0%,
      rgba(196, 248, 168, 0.95),
      rgba(78, 186, 88, 0.6) 46%,
      transparent 78%),
    radial-gradient(ellipse 122% 36% at 50% 0%,
      rgba(48, 126, 60, 0.62),
      transparent 72%);
  /* Two animations, two properties: the drift owns --canopy-x, the flicker owns opacity. Sharing a
     property would be a silent overwrite — animation is one property and the last value wins. */
  animation:
    frame-canopy-drift 9s ease-in-out infinite,
    frame-canopy-flicker 2.9s ease-in-out infinite;
}
@keyframes frame-canopy-drift {
  0%, 100% {
    --canopy-x: 18%;
  }
  50% {
    --canopy-x: 74%;
  }
}
/* The light also reaches INTO the card, from the top only: a directional inset shadow (offset down,
   negative spread) stays on this frame's own side, so the canopy never lights the floor. */
.frame-fx-canopy::before {
  box-shadow: inset 0 7px 11px -5px rgba(126, 224, 126, 0.55);
  animation: frame-canopy-flicker 2.9s ease-in-out infinite;
}
/* Deliberately uneven: a clean sine reads as a lamp being dimmed, not as leaves moving. */
@keyframes frame-canopy-flicker {
  0%, 100% {
    opacity: 0.74;
  }
  18% {
    opacity: 1;
  }
  34% {
    opacity: 0.82;
  }
  56% {
    opacity: 0.97;
  }
  78% {
    opacity: 0.7;
  }
}
`,
};
