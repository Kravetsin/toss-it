import type { EntranceModule } from '../types';

/**
 * The message doesn't fade in, it FAILS in: a few frames of a bad signal — the box arrives in
 * horizontal slices that don't line up, jittering sideways, before it snaps into place.
 *
 * `steps(1, end)` is the whole look. Interpolating between the slices would give a smooth morph,
 * which reads as liquid, not as broken: a glitch is a sequence of WRONG FRAMES, so each keyframe
 * must hold and then jump. It is also why the stops are unevenly spaced — a regular beat reads as a
 * pulse, an irregular one reads as a fault.
 *
 * `clip-path` does the slicing on the element itself, no extra markup — which the module system
 * could not give us anyway (a module emits styles, never DOM).
 *
 * NO chromatic split, and that is the interesting constraint. The classic one duplicates the text
 * into two coloured layers; with no second layer the only lever is `text-shadow` — and text-shadow
 * is a single property, so painting a fringe with it DELETES the bubble's legibility shadow for as
 * long as it holds. Worse, under `steps(1)` a value holds until the next keyframe that declares it,
 * so a fringe lit at 8% stays lit to 100%: the text would spend the whole arrival stripped of its
 * dark plate. That is the exact opposite of the rule this category is built on — chrome distorts,
 * glyphs do not. The split comes back when the surface hands us an ink variable or a second layer to
 * paint on, not before.
 *
 * 0.45s total: the chat overlay exists to be READ, on someone else's stream, and the streamer pays
 * for a viewer's cosmetic in legibility.
 */
export const entranceGlitch: EntranceModule = {
  id: 'entrance-glitch',
  type: 'entrance',
  costDust: 4500,
  fx: 'glitch',
  labels: { name: 'shop.entranceGlitch', desc: 'shop.entranceGlitchDesc' },
  css: `
[data-fx='glitch'] {
  animation: cosfx-glitch-in 0.45s steps(1, end) both;
}
@keyframes cosfx-glitch-in {
  0% {
    opacity: 0;
    clip-path: inset(48% 0 46% 0);
    transform: translateX(9px);
  }
  8% {
    opacity: 1;
    clip-path: inset(38% 0 22% 0);
    transform: translateX(-7px);
  }
  18% {
    clip-path: inset(6% 0 62% 0);
    transform: translateX(6px);
  }
  27% {
    clip-path: inset(64% 0 5% 0);
    transform: translateX(-4px);
  }
  38% {
    clip-path: inset(0 0 0 0);
    transform: translateX(3px);
  }
  /* The relapse: settling and then breaking once more is what sells a bad signal over a transition. */
  52% {
    clip-path: inset(28% 0 44% 0);
    transform: translateX(-3px);
  }
  61% {
    clip-path: inset(0 0 0 0);
    transform: translateX(2px);
  }
  74% {
    clip-path: inset(52% 0 30% 0);
    transform: translateX(-1px);
  }
  84% {
    clip-path: inset(0 0 0 0);
    transform: translateX(0);
  }
  100% {
    opacity: 1;
    clip-path: inset(0 0 0 0);
    transform: translateX(0);
  }
}
`,
};
