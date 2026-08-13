import type { CardEffectModule, Rnd } from '../types';
import { vdc } from '../spread';

/**
 * Something RAKES the card open, over and over. Three tapered gashes land together in one stroke, hold
 * for as long as the light inside them burns, and are gone — while the next stroke is already landing
 * somewhere else. Through the cuts there are stars: the card is a hide, and whatever is tearing it was
 * on the other side.
 *
 * WHY A STROKE AND NOT A CRACK. A lone tear cannot fill a card: hold it open long enough to be company
 * and it stops being an event, keep it brief and the card is empty most of the time. Three gashes
 * arriving at once solve both — one strike already fills a card, and it can still be over in a second.
 * Claw marks are a cliché on purpose; a cliché is a shape the eye names instantly, which is exactly
 * what a 15px chat pill needs.
 *
 * ONE PARTICLE IS ONE STRIKE, not one gash. The three gashes live in a single generated mask, so they
 * share a position, an angle and a timeline for free — no coordination between particles is needed,
 * and none is possible anyway (`particle()` cannot see its neighbours).
 *
 * THE BEAT: a strike lands about once a second and stays for two and a half, so two or three wounds
 * are always cooling at once. Those are not two settings — strikes land every `--dur`/count and the
 * number on screen is life ÷ that interval, so density can only be bought with a longer life, never
 * with a faster beat (bought that way it stops being an animal and turns into a machine gun). Phases
 * come from `vdc(index)` rather than a roll: independent draws clump, and clumping here means the
 * mauling stutters. It also spreads evenly for ANY count, which is what lets a chat pill run eight
 * strikes while a card runs twelve (see ../spread).
 *
 * SIZE IS DELIBERATELY OVERSIZED, and on the short surfaces it TRACKS the container's height — see
 * `--claw-base` in the css. A strike is meant to run off both edges and be clipped, but "run off the
 * edges" has to mean the same thing under one line of chat and under five: a fixed px length that
 * fills a one-line pill is a scratch lost in a five-line one.
 *
 * THE ENVELOPE IS THE ANIMAL. Rake open (~0.2s), burn (the white in the wound), and the moment that
 * white is gone the wound starts closing. Nothing waits: the fade begins exactly where the flash ends,
 * which is what turns a series of separate cuts into one continuous attack.
 *
 * FOUR LAYERS, and the split between them is load-bearing:
 *  - `.p` is UNMASKED and owns the glow plus the fade. Both of the masks below would clip it: a filter
 *    is computed BEFORE masking, so a drop-shadow on a masked element is cropped to that mask's box —
 *    which is precisely how this effect first shipped a soft RECTANGLE of light around every strike.
 *  - `::before` is the WOUND: the claw silhouette AND the rake, as two mask layers intersected, filled
 *    with a starfield that drifts inside it.
 *  - `::after` is the FLASH: plain white under the same pair of masks. It needs no motion of its own —
 *    the rake uncovers it a sliver at a time, so a static fill reads as an edge racing along the cuts.
 *  - `clawMask()` generates the silhouette per strike, like card-lightning's bolt: three tapered,
 *    jittered slivers of different lengths, because a repeated shape is read as a stamp within seconds.
 */

/** Gashes per strike. Three is the claw-mark cliché, and the whole point is that it is legible. */
const CLAWS = 3;

/**
 * One strike as an SVG mask (white = torn). The viewBox is stretched to the particle's box
 * (`preserveAspectRatio='none'`), so a strike takes its proportions from `--len`/`--thick` alone.
 *
 * Each gash is a FILLED sliver rather than a stroked line: a wound is widest at the middle and closes
 * to a point at both ends, which a uniform stroke cannot do. The spindle profile is `sin(πu)` flattened
 * by the exponent, so the taper happens near the tips instead of all the way along, plus per-point
 * jitter so the edge is torn rather than drawn.
 */
function clawMask(rnd: Rnd): string {
  // Per-claw span: the middle one reaches furthest, the outer two fall short by different amounts —
  // an uneven trio reads as a rake, three equal lines read as a logo.
  const spans: [number, number][] = [
    [rnd(6, 16), rnd(60, 74)],
    [rnd(0, 7), rnd(82, 92)],
    [rnd(10, 22), rnd(56, 70)],
  ];
  const paths: string[] = [];
  for (let i = 0; i < CLAWS; i++) {
    const [x0, len] = spans[i] ?? [0, 80];
    const yMid = 22 + (i - 1) * 13;
    // Each claw digs a little deeper or shallower, and none of them runs quite level.
    const half = rnd(2.6, 4.4);
    const tilt = rnd(-3, 3);
    const teeth = 8;
    const top: string[] = [];
    const bottom: string[] = [];
    for (let s = 0; s <= teeth; s++) {
      const u = s / teeth;
      const x = x0 + u * len;
      const y = yMid + tilt * (u - 0.5);
      const h = half * Math.pow(Math.sin(Math.PI * u), 0.55) * rnd(0.72, 1.18);
      top.push(`${x.toFixed(1)},${(y - h).toFixed(1)}`);
      bottom.push(`${x.toFixed(1)},${(y + h).toFixed(1)}`);
    }
    paths.push(`%3Cpath d='M${top.join('L')}L${bottom.reverse().join('L')}Z'/%3E`);
  }
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 44' preserveAspectRatio='none'%3E%3Cg fill='%23fff'%3E${paths.join('')}%3C/g%3E%3C/svg%3E")`;
}

export const cardClaws: CardEffectModule = {
  id: 'card-claws',
  type: 'card_effect',
  costDust: 5000,
  since: '2026-08-07',
  className: 'card-fx-claws',
  // Tinted at the LAYER (--cos-fx-tint, set by fillCardEffect) rather than per particle: nothing about
  // the colour varies between strikes, so there is nothing for particle() to decide.
  colorUpgrade: 'card-claws-color',
  // Count and duration are ONE decision, not two: strikes land every `--dur`/count, and how many are
  // on screen at once is life ÷ that interval — there is no third knob. Tuned for a blow about once a
  // second with two or three wounds still cooling, which is an animal working; the same density at a
  // shorter duration was a machine gun. The counts may differ per surface: vdc() spreads the phases
  // evenly whatever the number is, and a pill needs fewer wounds to look mauled than a card does.
  // (Eight on the pill, not seven: seven leaves a 3% sliver of the cycle with nothing on it, and a
  // chat row going bare shows — there is nothing else in it to look at.)
  counts: { web: 12, overlayCard: 10, overlayChat: 8 },
  labels: { name: 'shop.cardClaws', desc: 'shop.cardClawsDesc' },
  particle: (rnd, _compact, index) => {
    // One shared clock. Fixed rather than rolled, so the phases below stay where vdc() put them —
    // random durations drift apart within a minute and the beat turns lumpy.
    const dur = 12;
    return {
      // Off the very edge horizontally: a strike hanging out the SIDE reads as a rendering bug. The
      // vertical spread stays wide because being cut off top and bottom is the intent — see the size.
      left: `${rnd(16, 84).toFixed(1)}%`,
      top: `${rnd(18, 82).toFixed(1)}%`,
      // Variation only, around `--claw-base` (see the css): a wound that fits neatly inside its
      // container isn't a wound, it's a decoration, so the base is already bigger than the surface —
      // but it has to GROW with the surface, or the same strike that mauls a one-line pill is a
      // scratch under five lines. Thickness is a fraction of the length, never an independent roll:
      // a short fat strike reads as a smear, a long thin one as a hairline.
      '--claw-k': rnd(0.72, 1.28).toFixed(3),
      '--claw-t': rnd(0.19, 0.3).toFixed(3),
      '--rot': `${rnd(-40, 40).toFixed(1)}deg`,
      '--claw': clawMask(rnd),
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-vdc(index) * dur).toFixed(2)}s`,
    };
  },
  // Struck somewhere else, at a new angle, with new claws every cycle. Geometry only, never timing: a
  // strike doesn't travel, so its size is not tied to `--dur` (see CardEffectModule.respawnKeys).
  respawnKeys: ['top', '--claw-k', '--claw-t', '--rot', '--claw'],
  css: `
/* STRIKE LENGTH follows the container's height on the short surfaces (chat pill, name row), where that
   height is the thing that actually varies — one line or five. The cqh is read on .p, not here: a
   declaration ON the container element queries its PARENT container, not itself. The px term is the
   floor for a one-line pill, the clamp the ceiling so a tall bubble isn't raked by one huge claw. */
.card-fx-claws {
  container-type: size;
}
.card-fx-claws.compact .p {
  --claw-base: clamp(96px, calc(52px + 165cqh), 230px);
}
/* THE GLOW and THE FADE, on the one element that carries NO mask — see the header: masking here is
   what cropped the light into a rectangle. */
.card-fx-claws .p {
  --claw-base: 108px;
  --len: calc(var(--claw-base) * var(--claw-k, 1));
  --thick: calc(var(--len) * var(--claw-t, 0.24));
  width: var(--len, 110px);
  height: var(--thick, 26px);
  margin: calc(var(--thick, 26px) / -2) 0 0 calc(var(--len, 110px) / -2);
  rotate: var(--rot, 0deg);
  filter: drop-shadow(0 0 3px var(--cos-fx-tint, #a99cff))
    drop-shadow(0 0 10px color-mix(in srgb, var(--cos-fx-tint, #a99cff) 45%, transparent));
  animation: cardfx-claw-life var(--dur, 6s) linear var(--delay, 0s) infinite;
}
/* TWO MASK LAYERS, INTERSECTED: the claw silhouette (fixed) and the rake (slid across). Keeping them
   separate is what lets the rake animate without touching the shape — and keeps both off .p, where
   either would eat the glow. */
.card-fx-claws .p::before,
.card-fx-claws .p::after {
  content: '';
  position: absolute;
  inset: 0;
  -webkit-mask-image: var(--claw), linear-gradient(90deg, #000 50%, transparent 50%);
  mask-image: var(--claw), linear-gradient(90deg, #000 50%, transparent 50%);
  -webkit-mask-size:
    100% 100%,
    200% 100%;
  mask-size:
    100% 100%,
    200% 100%;
  -webkit-mask-repeat: no-repeat, no-repeat;
  mask-repeat: no-repeat, no-repeat;
  -webkit-mask-position:
    0 0,
    100% 0;
  mask-position:
    0 0,
    100% 0;
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
}
/* THE WOUND — starfield inside the cuts. At 200% background width the stars have somewhere to drift
   TO, and that parallax is what makes it a hole rather than a lit seam. */
.card-fx-claws .p::before {
  /* The STARS stay white whatever colour is chosen — they are stars, and tinting them would turn the
     hole into a coloured pane. Only the light BLED by the wound follows the tint: the two dim stars
     nearest it, and the void's own ramp, which is the tint crushed almost to black. */
  background:
    radial-gradient(circle at 18% 42%, #fff 0 0.6px, transparent 1.2px),
    radial-gradient(
        circle at 34% 66%,
        color-mix(in srgb, var(--cos-fx-tint, #a99cff) 45%, #fff) 0 0.5px,
        transparent 1.1px
      ),
    radial-gradient(circle at 52% 30%, #fff 0 0.7px, transparent 1.3px),
    radial-gradient(circle at 68% 58%, #cfe0ff 0 0.5px, transparent 1.1px),
    radial-gradient(circle at 82% 40%, #fff 0 0.6px, transparent 1.2px),
    radial-gradient(
        circle at 26% 22%,
        color-mix(in srgb, var(--cos-fx-tint, #a99cff) 80%, #fff) 0 0.4px,
        transparent 1px
      ),
    radial-gradient(circle at 74% 74%, #fff 0 0.4px, transparent 1px),
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--cos-fx-tint, #a99cff) 12%, #05040b),
      color-mix(in srgb, var(--cos-fx-tint, #a99cff) 26%, #06040f) 40%,
      color-mix(in srgb, var(--cos-fx-tint, #a99cff) 15%, #05040b)
    );
  background-size: 200% 100%;
  animation:
    cardfx-claw-rake var(--dur, 6s) cubic-bezier(0.12, 0.86, 0.2, 1) var(--delay, 0s) infinite,
    cardfx-claw-drift var(--dur, 6s) linear var(--delay, 0s) infinite;
}
/* THE FLASH — deliberately motionless white; the rake is what makes it travel. */
.card-fx-claws .p::after {
  background: #fff;
  animation:
    cardfx-claw-rake var(--dur, 6s) cubic-bezier(0.12, 0.86, 0.2, 1) var(--delay, 0s) infinite,
    cardfx-claw-flash var(--dur, 6s) ease-out var(--delay, 0s) infinite;
}
/* THE DEAD LEAD-IN (0–2%) IS NOT SPARE TIME. bindRespawn moves a strike to its next position on the
   \`animationiteration\` event, and that event is DISPATCHED asynchronously — a frame or two after the
   new cycle has already started drawing. Every other effect in the catalog opens its cycle at
   opacity 0 and fades in, so the gap never shows (see bindRespawn's own note). This one opens with a
   0.2s rake — the fastest entrance here — so without a blind head start the strike begins tearing at
   the OLD position and then jumps to the new one, in plain sight. 2% is ~0.24s: a dozen frames of
   cover for an event that needs one.
   After that: the wound closes the instant its light goes out — the flash is spent at 11% and the fade
   starts exactly there, no pause in between, which is what makes a run of separate cuts read as one
   animal working rather than as a queue of effects. */
@keyframes cardfx-claw-life {
  0%,
  2% {
    opacity: 0;
  }
  2.001%,
  11% {
    opacity: 1;
  }
  24%,
  100% {
    opacity: 0;
  }
}
/* The rake: all three gashes opened by one sweep, starting after the lead-in and done in ~0.24s.
   Nothing about this is gentle, hence the hard mask edge — a soft one would read as a fade-in. */
@keyframes cardfx-claw-rake {
  0%,
  2% {
    -webkit-mask-position:
      0 0,
      100% 0;
    mask-position:
      0 0,
      100% 0;
  }
  4%,
  100% {
    -webkit-mask-position:
      0 0,
      0% 0;
    mask-position:
      0 0,
      0% 0;
  }
}
@keyframes cardfx-claw-drift {
  0% {
    background-position: 0% 50%;
  }
  100% {
    background-position: 100% 50%;
  }
}
@keyframes cardfx-claw-flash {
  0%,
  4% {
    opacity: 0.95;
  }
  11%,
  100% {
    opacity: 0;
  }
}
`,
};
