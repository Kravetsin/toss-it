import type { CardEffectModule } from '../types';

/**
 * A small flock of fuchsia butterflies that drift a smooth, banking path across the card, wings
 * beating the whole way — the calm cousin of card-wisp's darting will-o'-wisps. A few discrete
 * creatures, not a fine swarm, so (like wisp) this skips the depth planes and just rolls size per
 * butterfly; near/far reads from size + flap speed, no parallax field to build.
 *
 * EACH BUTTERFLY is `.p` (the body) plus its two pseudo wings, and the split is what lets the wings
 * flap while the body holds still:
 *  - `.p` is the BODY — a slim dark-magenta abdomen with a head and two clubbed antennae, baked into
 *    an SVG background so it reads as a body at any size. It carries the MOTION, as two animations:
 *      · FLIGHT (cardfx-bfly-fly): the path (translate), the heading (rotate) and the fade (opacity).
 *        Runs at LINEAR speed — an earlier ease-in-out eased to a full stop at every waypoint, which
 *        read as swimming (glide, stop, push off). A butterfly FACES WHERE IT FLIES: the path is a
 *        bounded-turn walk (each leg ≤~40° off the last), the heading a leg leaves at IS its travel
 *        direction, and since the body points up (-Y), `rotate = heading + 90°` aims it along that leg.
 *        So `rotate` is derived from the path, never a free bank — that is what stops it flying backward.
 *      · SURGE (cardfx-bfly-surge): a small forward thrust once per wing-beat (a transform, applied
 *        inside the heading rotate so it fires along the current course), so the butterfly always
 *        creeps forward and lurches on each flap instead of gliding evenly. Shares --fd with the flap.
 *    Two animations on `.p` means bindRespawn (../registry.ts), which re-rolls on `animationiteration`,
 *    would fire on every surge beat — so the module declares `cycleAnimation` and only the slow flight's
 *    loop (at opacity 0) counts as a rebirth.
 *  - `::before` / `::after` are the LEFT and RIGHT WINGS: a wing silhouette (fore + hind lobe) as a
 *    `mask`, painted by a fuchsia gradient underneath (so the colour varies per butterfly while the
 *    shape stays crisp), with a couple of pale spots showing through. Each flaps by rotating about its
 *    INNER edge (`rotateY` under a shallow `perspective`) — the foreshortening as the wing turns edge-on
 *    is what reads as a beat rather than a flat horizontal squash. Both wings share `--fd` and run in
 *    phase, so the pair opens and closes together.
 *
 *    The two wings are a true MIRROR, and getting that right is the whole trick. The left wing is NOT
 *    the right one flipped with `scaleX(-1)`: that reflects about the transform-origin, which is the
 *    INNER edge, so it throws the wing across to the other side (both halves pile onto one side and beat
 *    as a single sheet) — and `scaleX(-1)·rotateY(θ)` is `rotateY(-θ)`, so the depths disagree too.
 *    Instead the SHAPE is mirrored in the mask itself (a pre-flipped SVG, `WING_L`) and the ROTATION is
 *    mirrored by SIGN: the right wing folds with `rotateY(+θ)`, the left with `rotateY(-θ)`. Now both
 *    outer tips swing toward the centre together and both tuck behind — a symmetric beat, two wings.
 *
 * WHY THE WINGS DON'T HIDE THE BODY. A pseudo paints ABOVE its host's background, so the body (on `.p`)
 * would sit under the wings. Instead each wing is inset a hair from centre (a `--bw`-wide gap), and the
 * body shows through that central column while the wings flank it and hinge at its edges — anatomically
 * right and it sidesteps the z-order entirely, no negative z-index tricks.
 *
 * THE HAZE fills the space between butterflies so the card never looks empty (same idea as wisp): the
 * LAYER'S own pseudo-elements carry a few drifting fuchsia blooms (`::before`) and a field of tiny
 * pollen motes (`::after`), both very faint — atmosphere, not subject.
 *
 * COMPACT (leaderboard row, chat pill): fewer, smaller butterflies on a calmer, shallower beat, so a
 * ~40px row reads as gliding rather than fidgeting.
 *
 * No groundGlow: a butterfly hovers and wanders, it never rises from or lands on the bottom edge.
 */

/** Bright fuchsia / magenta wing colours — the deep stop of each wing's gradient (pale tip is fixed). */
const FUCHSIA = ['#ff2e9a', '#ff4fc3', '#e838d8', '#ff5cd0', '#d42bb4'];

// The RIGHT wing silhouette, body edge on the LEFT (x=0), waist at mid-height. Two lobes, anatomically
// shaped (see the refs): a TRIANGULAR forewing with a pointed apex up-and-out (the top "V"), and a
// smaller ROUNDED hindwing below. White fill = the mask's opaque region; the gradient beneath supplies
// the colour.
const WING_PATH =
  'M2,50 C4,27 24,8 52,8 C68,8 82,9 88,14 C92,28 84,44 70,51 C48,58 16,58 2,56 Z M2,60 C18,61 44,66 64,80 C78,90 74,110 56,110 C40,110 14,94 2,78 Z';
const WING = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 116'%3E%3Cpath fill='%23fff' d='${WING_PATH}'/%3E%3C/svg%3E") center/contain no-repeat`;
// The LEFT wing: the same silhouette mirrored IN THE MASK (body edge ends up on the right), so the flap
// can be a plain sign-flipped rotateY with no scaleX — see the header for why that matters.
const WING_L = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 116'%3E%3Cg transform='translate(100 0) scale(-1 1)'%3E%3Cpath fill='%23fff' d='${WING_PATH}'/%3E%3C/g%3E%3C/svg%3E") center/contain no-repeat`;

// The body: a slim abdomen + head + two clubbed antennae, dark magenta so it reads against the wings.
const BODY =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 66'%3E%3Cg fill='%232a0820'%3E%3Crect x='10.5' y='16' width='3' height='44' rx='1.5'/%3E%3Ccircle cx='12' cy='14' r='3.2'/%3E%3Cpath d='M12,12 C10,7 8,5 5.5,3.5' fill='none' stroke='%232a0820' stroke-width='1.5' stroke-linecap='round'/%3E%3Cpath d='M12,12 C14,7 16,5 18.5,3.5' fill='none' stroke='%232a0820' stroke-width='1.5' stroke-linecap='round'/%3E%3Ccircle cx='5.5' cy='3.5' r='1.7'/%3E%3Ccircle cx='18.5' cy='3.5' r='1.7'/%3E%3C/g%3E%3C/svg%3E\") center/contain no-repeat";

export const cardButterflies: CardEffectModule = {
  id: 'card-butterflies',
  type: 'card_effect',
  costDust: 4500,
  since: '2026-07-24',
  className: 'card-fx-butterflies',
  counts: { web: 5, overlayCard: 6, overlayChat: 4 },
  // Honours the viewer's chosen colour (the card-butterflies-color upgrade) — drawn exactly; see particle().
  colorable: true,
  labels: { name: 'shop.cardButterflies', desc: 'shop.cardButterfliesDesc' },
  // .p runs TWO animations (the slow flight + the fast wing-beat surge); only the flight's loop is a
  // rebirth. Without this, bindRespawn would re-roll on every surge beat, mid-flight (see its use).
  cycleAnimation: 'cardfx-bfly-fly',
  particle: (rnd, compact, _index, color) => {
    // Size scale for depth: bigger butterflies read as nearer. Body is proportioned off the wing.
    const s = rnd(0.82, 1.22);
    const wing = (compact ? 11 : 17) * s;
    const bh = wing * 0.55;
    const bw = bh * 0.36; // 24:66 is the body SVG's aspect
    // The viewer's chosen colour is drawn EXACTLY — all butterflies that one colour, no lightness or
    // saturation clamp, so a dark/muted/greyscale pick renders as picked (the wing gradient keeps a
    // white hotspot; the rest is this colour). Default (no upgrade) rolls the fuchsia palette.
    const fuchsia = color ?? FUCHSIA[Math.floor(rnd(0, FUCHSIA.length - 0.0001))]!;

    // Flight: a bounded-turn walk of 4 legs (see the header). The heading a leg leaves at is its travel
    // direction; the body faces up (-Y), so its `rotate` is that heading + 90° — the butterfly always
    // points where it goes. The walk drifts off rather than looping back to origin: it fades out and
    // respawns elsewhere (natural coverage), the loop-point jump hidden at opacity 0. Tighter steps in
    // a compact row keep a butterfly in its lane.
    const step = compact ? { min: 9, max: 15 } : { min: 14, max: 24 };
    let h = rnd(0, Math.PI * 2);
    let x = 0;
    let y = 0;
    let lastH = h; // heading of the final leg — the fade-out glide continues in this direction
    const pos: string[] = [];
    const rot: string[] = [];
    for (let i = 0; i < 4; i++) {
      rot.push(`${((h * 180) / Math.PI + 90).toFixed(1)}deg`);
      lastH = h;
      const L = rnd(step.min, step.max);
      x += Math.cos(h) * L;
      y += Math.sin(h) * L;
      pos.push(`${x.toFixed(0)}px ${y.toFixed(0)}px`);
      h += rnd(-0.7, 0.7); // ≤ ~40° turn into the next leg
    }
    // A 5th continuation leg, same heading as the last: it is travelled WHILE fading out, so a butterfly
    // glides off in motion instead of freezing on the final waypoint to vanish on the spot.
    const l5 = rnd(step.min, step.max);
    const w5x = x + Math.cos(lastH) * l5;
    const w5y = y + Math.sin(lastH) * l5;

    const dur = compact ? rnd(5, 7.5) : rnd(2, 9.5);
    return {
      left: `${rnd(12, 88).toFixed(1)}%`,
      top: `${rnd(16, 84).toFixed(1)}%`,
      '--w': `${wing.toFixed(1)}px`,
      '--bw': `${bw.toFixed(1)}px`,
      '--bh': `${bh.toFixed(1)}px`,
      // Forward thrust per wing-beat, scaled to the butterfly's size (see the surge animation). Kept
      // small on purpose: the slow recoil must stay below the drift speed so the net never reverses.
      '--surge': `${(wing * 0.03).toFixed(1)}px`,
      '--fuchsia': fuchsia,
      '--glow': fuchsia,
      '--w1': pos[0]!,
      '--w2': pos[1]!,
      '--w3': pos[2]!,
      '--w4': pos[3]!,
      // Continuation point, reached while fading out (see the fly keyframe).
      '--w5': `${w5x.toFixed(0)}px ${w5y.toFixed(0)}px`,
      '--r0': rot[0]!,
      '--r1': rot[1]!,
      '--r2': rot[2]!,
      '--r3': rot[3]!,
      // The final leg holds its heading through the fade-out (no next leg to turn toward).
      '--r4': rot[3]!,
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
      // Wing-beat period, independent of the flight — calmer in a compact row (see the header).
      '--fd': `${(compact ? rnd(0.36, 0.5) : rnd(0.3, 0.44)).toFixed(2)}s`,
    };
  },
  // Reborn each cycle with a new spot, size, colour and flight path (positions + headings) — all at
  // opacity 0 (see the fly keyframe). The flap runs on the pseudos and is left alone.
  respawnKeys: [
    'top',
    '--w',
    '--bw',
    '--bh',
    '--surge',
    '--fuchsia',
    '--glow',
    '--w1',
    '--w2',
    '--w3',
    '--w4',
    '--w5',
    '--r0',
    '--r1',
    '--r2',
    '--r3',
    '--r4',
    '--fd',
  ],
  css: `
/* THE HAZE — atmosphere on the layer's own pseudo-elements (the butterflies are .p children, so these
   are free). Faint by design: it fills the gaps, it is not the subject. */
.card-fx-butterflies::before,
.card-fx-butterflies::after {
  content: '';
  position: absolute;
  inset: -20%;
  pointer-events: none;
}
/* Drifting fuchsia blooms. */
.card-fx-butterflies::before {
  background:
    radial-gradient(42% 55% at 28% 38%, rgba(255, 79, 195, 0.06), transparent 70%),
    radial-gradient(46% 52% at 74% 64%, rgba(232, 56, 216, 0.05), transparent 70%),
    radial-gradient(38% 46% at 55% 20%, rgba(255, 92, 208, 0.045), transparent 70%);
  animation: cardfx-bfly-haze 26s ease-in-out infinite;
}
/* A field of tiny pollen motes, tiling so it fills any surface; rises and twinkles. */
.card-fx-butterflies::after {
  background-image:
    radial-gradient(1px 1px at 24px 30px, rgba(255, 214, 242, 0.7), transparent),
    radial-gradient(1px 1px at 96px 82px, rgba(255, 160, 220, 0.55), transparent),
    radial-gradient(1.3px 1.3px at 152px 46px, rgba(255, 214, 242, 0.5), transparent),
    radial-gradient(1px 1px at 62px 128px, rgba(255, 150, 210, 0.5), transparent);
  background-size: 170px 170px, 210px 210px, 140px 140px, 190px 190px;
  animation: cardfx-bfly-motes 17s ease-in-out infinite;
}
.card-fx-butterflies.compact::before {
  opacity: 0.5;
}
@keyframes cardfx-bfly-haze {
  0%,
  100% {
    transform: translate(-3%, -2%) scale(1);
    opacity: 0.8;
  }
  50% {
    transform: translate(3%, 2%) scale(1.08);
    opacity: 1;
  }
}
@keyframes cardfx-bfly-motes {
  0%,
  100% {
    transform: translateY(6px);
    opacity: 0.5;
  }
  50% {
    transform: translateY(-6px);
    opacity: 0.95;
  }
}

/* THE BUTTERFLY — body .p (wanders + banks), wings ::before (left) / ::after (right) (flap). The body
   box is centred on the anchor via the negative margin, like wisp's core. */
.card-fx-butterflies .p {
  top: 0;
  width: var(--bw, 5px);
  height: var(--bh, 14px);
  margin: calc(var(--bh, 14px) / -2) 0 0 calc(var(--bw, 5px) / -2);
  background: ${BODY};
  /* Two animations: the slow FLIGHT (path + heading + fade) at LINEAR speed so it never eases to a
     stop at a waypoint (that dead-stop-then-push read as swimming), and the fast SURGE — a small
     forward thrust once per wing-beat (period --fd, the flap's own), so the butterfly always creeps
     forward and lurches on each beat. The surge is a transform, applied INSIDE the heading rotate, so
     its local "up" thrust comes out aimed along the current travel direction. */
  animation:
    cardfx-bfly-fly var(--dur, 11s) linear var(--delay, 0s) infinite,
    cardfx-bfly-surge var(--fd, 0.4s) ease-in-out infinite;
  /* The neon glow lives HERE, on the (unmasked) parent — NOT on the wings. A wing has a mask, and mask
     is applied AFTER filter in the render order, so a drop-shadow on the wing is clipped away to the
     wing's own silhouette (the glow lives outside the shape — exactly what the mask erases). On .p the
     shadow is cast from the whole butterfly's composited alpha (body + both wings) and nothing clips
     it: a bright near-white inner edge (the "tube") wrapped in two colour halos, tight then wide. */
  filter:
    drop-shadow(0 0 1.5px #ffffff) drop-shadow(0 0 5px var(--glow, #ff5cd0))
    drop-shadow(0 0 11px var(--glow, #ff5cd0));
}
/* A wing: the silhouette masks a fuchsia gradient (colour per butterfly) with two pale spots showing
   through, and a soft same-colour glow. Vertically centred on the body via the negative margin. Mask,
   gradient and flap are per-wing below (the two are mirror images, not one shape flipped). */
.card-fx-butterflies .p::before,
.card-fx-butterflies .p::after {
  content: '';
  position: absolute;
  top: 50%;
  width: var(--w, 25px);
  height: calc(var(--w, 25px) * 1.16);
  margin-top: calc(var(--w, 25px) * -0.58);
  /* Glow is on .p, not here — a mask on this element would clip a drop-shadow away (see .p). */
}
/* Right wing: hinges at its inner (left) edge, inset a hair right of centre so the body shows in the
   gap. Folds inward with rotateY(+θ). */
.card-fx-butterflies .p::after {
  left: 50%;
  margin-left: 1px;
  transform-origin: left center;
  background:
    radial-gradient(72% 62% at 34% 32%, #ffffff, var(--fuchsia, #ff2e9a) 68%),
    radial-gradient(16% 13% at 66% 30%, rgba(255, 255, 255, 0.5) 0 40%, transparent 62%),
    radial-gradient(13% 12% at 52% 74%, rgba(255, 255, 255, 0.34) 0 45%, transparent 64%);
  -webkit-mask: ${WING};
  mask: ${WING};
  animation: cardfx-bfly-flap-r var(--fd, 0.42s) ease-in-out infinite;
}
/* Left wing: the MIRRORED silhouette (WING_L), hinging at its inner (right) edge, inset a hair left of
   centre. Gradient/spots mirrored (x → 100−x) so the shading matches. Folds inward with rotateY(−θ) —
   the sign, not scaleX, is what mirrors the beat (see the header). */
.card-fx-butterflies .p::before {
  right: 50%;
  margin-right: 1px;
  transform-origin: right center;
  background:
    radial-gradient(72% 62% at 66% 32%, #ffffff, var(--fuchsia, #ff2e9a) 68%),
    radial-gradient(16% 13% at 34% 30%, rgba(255, 255, 255, 0.5) 0 40%, transparent 62%),
    radial-gradient(13% 12% at 48% 74%, rgba(255, 255, 255, 0.34) 0 45%, transparent 64%);
  -webkit-mask: ${WING_L};
  mask: ${WING_L};
  animation: cardfx-bfly-flap-l var(--fd, 0.42s) ease-in-out infinite;
}
/* The beat: the wing turns from nearly flat (open) toward edge-on (folded up); the perspective
   foreshortening as it turns is what reads as a flap, not a flat squash. Left = the negated angle,
   so the pair folds symmetrically toward the centre. */
@keyframes cardfx-bfly-flap-r {
  0%,
  100% {
    transform: perspective(150px) rotateY(14deg);
  }
  50% {
    transform: perspective(150px) rotateY(74deg);
  }
}
@keyframes cardfx-bfly-flap-l {
  0%,
  100% {
    transform: perspective(150px) rotateY(-14deg);
  }
  50% {
    transform: perspective(150px) rotateY(-74deg);
  }
}
/* Compact rows: a shallower, calmer beat so a tight pill reads as gliding, not fidgeting. */
.card-fx-butterflies.compact .p::after {
  animation-name: cardfx-bfly-flap-r-c;
}
.card-fx-butterflies.compact .p::before {
  animation-name: cardfx-bfly-flap-l-c;
}
@keyframes cardfx-bfly-flap-r-c {
  0%,
  100% {
    transform: perspective(150px) rotateY(20deg);
  }
  50% {
    transform: perspective(150px) rotateY(60deg);
  }
}
@keyframes cardfx-bfly-flap-l-c {
  0%,
  100% {
    transform: perspective(150px) rotateY(-20deg);
  }
  50% {
    transform: perspective(150px) rotateY(-60deg);
  }
}
/* One animation on .p: the flight (translate along the path), the heading (rotate = travel course, so
   the body faces where it flies) and the opacity envelope — so respawn fires once, at opacity 0, which
   also hides the drift-off → respawn jump. Each keyframe's rotate is the heading LEAVING that point, so
   every leg starts aligned to its travel and eases into the next turn. */
@keyframes cardfx-bfly-fly {
  0% {
    opacity: 0;
    translate: 0 0;
    rotate: var(--r0, 0deg);
  }
  7% {
    opacity: 1;
  }
  20% {
    translate: var(--w1, 0 0);
    rotate: var(--r1, 0deg);
  }
  40% {
    translate: var(--w2, 0 0);
    rotate: var(--r2, 0deg);
  }
  60% {
    translate: var(--w3, 0 0);
    rotate: var(--r3, 0deg);
  }
  80% {
    opacity: 1;
    translate: var(--w4, 0 0);
    rotate: var(--r4, 0deg);
  }
  /* Fades out over the last leg (w4 → w5) instead of holding on w4 — so it disappears mid-glide. */
  100% {
    opacity: 0;
    translate: var(--w5, 0 0);
    rotate: var(--r4, 0deg);
  }
}
/* The wing-beat surge: a quick forward thrust (local -Y, aimed along the heading by the rotate above)
   that eases back, once per flap. Small vs the steady linear drift, so the sum never reverses — the
   butterfly keeps moving forward and just pulses on each beat. Shares --fd with the flap, no delay, so
   the two stay locked in phase. */
@keyframes cardfx-bfly-surge {
  0% {
    transform: translateY(0);
  }
  20% {
    transform: translateY(calc(var(--surge, 2px) * -1));
  }
  100% {
    transform: translateY(0);
  }
}
`,
};
