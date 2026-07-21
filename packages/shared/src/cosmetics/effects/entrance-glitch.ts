import type { EntranceModule } from '../types';

/**
 * The message doesn't fade in, it FAILS in: a few frames of a bad signal — the box arrives in
 * horizontal slices that don't line up, jittering sideways, before it snaps into place.
 *
 * Two shapes, and the arc runs between them:
 * - `inset()` — one band, the rest of the box not there yet. Arrival. Frames 0-27%.
 * - `polygon()` with a NOTCH — the box whole, one band pulled out to the side. Only a RELAPSE can
 *   wear one: it says "arrived, then broke", which is a lie before the box has arrived.
 * Mixing the two in one animation is normally a non-starter — they do not interpolate — and works
 * here only because of the timing below.
 *
 * `steps(1, end)` is the whole look, and also the reason the above is legal: progress inside a
 * segment is pinned to 0, so every value is HELD and then jumped, never blended. Interpolating would
 * give a smooth morph, which reads as liquid — a glitch is a sequence of WRONG FRAMES. The stops are
 * unevenly spaced for the same reason: a regular beat is a pulse, an irregular one is a fault.
 *
 * PURE GEOMETRY: clip-path, translate, opacity. Nothing painted on, nothing scaled. Colour was tried
 * (magenta/cyan fringes, cyan scanlines) and read as a costume rather than a fault; a vertical crush
 * was tried and read as a bounce. Neither is coming back — the box is wronged, not dressed up.
 *
 * NO chromatic split, and that is the interesting constraint. The classic one duplicates the text
 * into two coloured layers; with no second layer the only lever is `text-shadow` — and text-shadow
 * is a single property, so painting a fringe with it DELETES the bubble's legibility shadow for as
 * long as it holds. Worse, under `steps(1)` a value holds until the next keyframe that declares it,
 * so a fringe lit at 8% stays lit to 100%: the text would spend the whole arrival stripped of its
 * dark plate. That is the exact opposite of the rule this category is built on — chrome distorts,
 * glyphs do not.
 *
 * 0.6s total: slowed a touch from 0.45s so the fault has room to be enjoyed — still short, because
 * the chat overlay exists to be READ, on someone else's stream, and the streamer pays for a viewer's
 * cosmetic in legibility.
 */
export const entranceGlitch: EntranceModule = {
  id: 'entrance-glitch',
  type: 'entrance',
  // Entry shelf for equipped entrances. It used to sit level with the portal at 4000, but a 0.6s CSS
  // fault next to a 1.7s particle wormhole is a plain step down — at the same price nobody would pick
  // it, so the slot was dead. Halved to 2000: the affordable way IN to the category, with the portal
  // (and the newer showpieces) as the thing to save up for.
  costDust: 2000,
  fx: 'glitch',
  labels: { name: 'shop.entranceGlitch', desc: 'shop.entranceGlitchDesc' },
  css: `
[data-fx='glitch'] {
  animation: cosfx-glitch-in 0.6s steps(1, end) both;
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
  /* The relapses: settling and then breaking once more is what sells a bad signal over a
     transition. These two are NOTCHES rather than bands, and the difference is the whole point of
     them — an inset() shows one band and hides the rest, which reads as "not arrived yet"; a notch
     keeps the box whole and pulls one band out to the side, which reads as "arrived, then broke".
     Only a relapse can use one: before 38% the box genuinely is not all there.
     Honest about its limit: a notch does not MOVE the slice, it bites a piece off the edge. Really
     displacing one needs the content duplicated into a second layer, and a module emits styles,
     never DOM. At a tenth of a second nobody counts the pixels; they read the break. */
  52% {
    clip-path: polygon(0 0, 100% 0, 100% 20%, 78% 20%, 78% 32%, 100% 32%, 100% 100%, 0 100%);
    transform: translateX(-3px);
  }
  61% {
    clip-path: inset(0 0 0 0);
    transform: translateX(2px);
  }
  /* Second notch bites the other side, lower and shallower — the fault dying out, not stopping dead. */
  74% {
    clip-path: polygon(0 0, 100% 0, 100% 66%, 22% 66%, 22% 76%, 100% 76%, 100% 100%, 0 100%);
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
