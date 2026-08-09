import type { CardEffectModule, Rnd } from '../types';
import { type DepthPlane, depthCount, depthPlane, parallaxDur } from '../depth';

/**
 * Jellyfish rising through the card in slow pulses. A bell fills, squeezes, and the squeeze IS the
 * push — then the animal coasts while the bell opens again and its arms catch up.
 *
 * THE PUSH AND THE PULSE ARE ONE CLOCK, and this is the whole reason the effect works. They started as
 * two: the bell had its own rolled duration and the climb had another, so within seconds a bell would
 * be contracting while its owner hung still, and a jellyfish that pulses without moving is a decoration
 * of a jellyfish. Here the climb is divided into exactly PULSES surges, and the bell's duration IS the
 * climb's divided by that same number — so the two can never drift, whatever duration a particle rolls.
 * Every layer also shares one `--delay`: with an integer ratio between the periods, one negative delay
 * puts all three at the same point of the same stroke.
 *
 * WHAT A STROKE LOOKS LIKE, and where it is written: the keyframes hold only an even ladder of
 * distance, one rung per stroke — the SHAPE lives in the easing on `.p`, because one keyframe segment
 * is one stroke. It drifts, peaks at 1.4× its average speed at 44% of the stroke (the frame the bell is
 * fully squeezed), glides, and drifts on into the next one at about a quarter of average. Never zero:
 * an animal in water coasts, it does not park, and every stock easing keyword ends or begins at a
 * standstill.
 *
 * THE ARMS ARE BEHIND THE BELL, not on top of it — `::before` paints before `::after`, so the tentacles
 * go on the first and the dome on the second. Their roots then disappear under the bell instead of
 * being drawn across it, and because the dome is translucent they show through it faintly, which is
 * what you actually see looking at one.
 *
 * THE ARMS ARE GENERATED, one bundle per animal: four to six thick oral arms — tapered ribbons, each
 * with its own bend — and a handful of fine tentacles trailing much longer. Straight lines of equal
 * length are the thing that made the first version read as a hairbrush, and no CSS-authored bundle can
 * avoid that, because a stylesheet can only hold ONE arrangement. They also lag: the bundle's stretch
 * runs a seventh of a stroke behind the bell, so the arms are pulled taut just after the push and
 * gather again as the animal slows.
 *
 * DEPTH uses the shared quota (../depth) but its OWN blur table: every animal here is far away — there
 * is no foreground plane, deliberately (see particle) — so the closest of them is the sharpest and the
 * furthest the softest, which is the reverse of what a swarm with a near plane wants. Size still drives
 * both the blur and the speed (parallaxDur), the way it does everywhere in the catalog.
 *
 * ONE ELEMENT, THREE CREATURES. The swarm is not all animals: its first SHAFTS particles are columns of
 * light and the next MOTES are specks of marine snow. All three are the same `.p` box — `--hide` takes
 * the bell and arms away, `--bg` replaces what is painted on it, and `--anim` swaps the keyframes.
 *
 * Both were layers on the effect's own pseudo-elements first, and both had to move:
 *  - the snow was a pair of tiled backgrounds. A tile repeats across the card and is identical on every
 *    card in the feed, and the eye finds that long before it reads the specks as snow;
 *  - the light was three gradients stacked on one element, which forced them to share an opacity, a
 *    filter and a transform — so they could only ever move together, and the whole layer could offer
 *    nothing richer than a slide. As particles they each get their own behaviour.
 */

/** Surges per crossing. The bell's period is the climb's divided by this, which is what keeps them
 *  locked; changing it changes the animal's cadence and nothing else. */
const PULSES = 6;
/** Seconds for a mid-plane jellyfish to cross. Near ones are quicker, far ones slower (parallaxDur). */
const BASE_DUR = 15;

/**
 * Motes of marine snow, taken off the top of the swarm: index < MOTES is a speck, the rest are animals.
 *
 * A CONSTANT, not a per-surface count, and that is what makes the split possible at all — `particle()`
 * is handed an index but never told which surface it is on, so only a number that is the same
 * everywhere can divide the two. The per-surface `counts` then vary the number of ANIMALS alone.
 *
 * They are particles rather than a tiled background because a tile repeats: the same constellation
 * printed four times across a card is caught immediately, and it is identical on every card in the
 * feed. Rolled per speck, there is no pattern to catch.
 */
const MOTES = 20;

/**
 * Shafts of light, taken off the top of the swarm ahead of the snow: index < SHAFTS is a column.
 *
 * PARTICLES, not layers on the effect's own pseudo-elements, and that is the whole reason they can do
 * anything interesting. Three gradients stacked on one element share one opacity, one filter and one
 * transform, so they can only ever move together — which is exactly why the previous version could
 * offer nothing but a slide. As particles each column is its own box: one breathes its brightness,
 * one goes in and out of focus, one fans open and narrows, each on its own clock.
 *
 * They come FIRST so they paint behind everything: light is what the animals are swimming through.
 */
const SHAFTS = 3;

/**
 * Which way the sun is. ONE angle for every column, because there is one sun — shafts that each lean
 * their own way cross each other, and crossing beams have two sources.
 *
 * What they may do is vary by a degree either side of it: the surface they come through is moving, so
 * the beams wobble. Anything past a couple of degrees stops being refraction and starts being a second
 * sun, which is exactly how this shipped the first time.
 */
const SUN_TILT = 9;
const SUN_WOBBLE = 1.2;

/**
 * One column of light. Its place is fixed by index rather than rolled, and that is load-bearing:
 * bindRespawn re-rolls `left` at the end of every cycle, so a random column would teleport sideways
 * once per period. Three fixed positions also spread better than three draws usually would.
 */
function shaft(rnd: Rnd, compact: boolean, index: number): Record<string, string> {
  // wide-and-bright / narrow-and-soft / medium-and-fanning — assigned, not drawn, so a card always
  // gets one of each rather than three of a kind.
  const kind = index % 3;
  const dur = [rnd(13, 17), rnd(9.5, 13), rnd(16, 21)][kind]!;
  const w = compact
    ? [rnd(26, 40), rnd(9, 15), rnd(16, 26)][kind]!
    : [rnd(62, 92), rnd(17, 28), rnd(34, 52)][kind]!;
  return {
    // Spread across the card and never moved again (see above).
    left: ['19%', '53%', '82%'][index % 3]!,
    top: '-30%',
    '--w': `${w.toFixed(0)}px`,
    '--h': `${compact ? 120 : 330}px`,
    // One sun, one angle — plus a degree of wobble from the surface it came through (see SUN_TILT).
    '--prot': `${(SUN_TILT + rnd(-SUN_WOBBLE, SUN_WOBBLE)).toFixed(1)}deg`,
    // Soft on both edges: a shaft with a crisp edge is a stripe.
    '--bg': `linear-gradient(90deg, transparent 0%, color-mix(in srgb, var(--cos-fx-tint, #9db8ff) 13%, transparent) 38%, color-mix(in srgb, var(--cos-fx-tint, #9db8ff) 15%, transparent) 58%, transparent 100%)`,
    // Light dies with depth — the column fades out as it goes down rather than ending on a line.
    '--pmask': 'linear-gradient(180deg, #000 0 42%, transparent 92%)',
    // The box default (50%) is for the snow dot; an ellipse would bite the ends off a column.
    '--round': '0px',
    '--hide': '1',
    '--anim': ['cardfx-jelly-shaft-lit', 'cardfx-jelly-shaft-soft', 'cardfx-jelly-shaft-fan'][
      kind
    ]!,
    '--ease': 'ease-in-out',
    '--dur': `${dur.toFixed(1)}s`,
    '--delay': `${(-rnd(0, dur)).toFixed(1)}s`,
    // The second clock every column shares: a slow sideways wander, on a period unrelated to its own
    // behaviour, so the two never line up.
    '--anim2': 'cardfx-jelly-shaft-drift',
    '--dur2': `${rnd(23, 38).toFixed(1)}s`,
    '--delay2': `${(-rnd(0, 20)).toFixed(1)}s`,
    '--drift': `${rnd(3, 9).toFixed(1)}%`,
  };
}

/**
 * Blur per plane — deliberately NOT the shared DEPTH_BLUR_RATIO_SHAPED, and the difference matters.
 * That table describes a plane in FRONT of the card's focus, so it blurs `near` hardest. Every animal
 * here is BEHIND that focus (see the z bands in particle), so the ordering inverts: the furthest go
 * soft and the closest of them stays sharpest. Left on the shared ratios, the biggest animals were
 * also the blurriest, which is exactly how a small jellyfish turns into a big vague blob.
 */
const BLUR_RATIO: Record<DepthPlane, number> = { near: 0, mid: 0.02, far: 0.075 };
/**
 * And a hard ceiling on top of the ratio. Blur spreads a silhouette by several times its radius, so
 * past a pixel and a half the animal stops reading as distant and starts reading as bigger and vaguer —
 * the opposite of what the blur was bought for.
 */
const BLUR_MAX = 1.2;

/** One speck of marine snow: tiny, slow, sinking. Everything about it is rolled. */
function mote(rnd: Rnd, compact: boolean): Record<string, string> {
  const w = rnd(0.8, 1.9);
  const dur = rnd(26, 58);
  return {
    left: `${rnd(1, 99).toFixed(1)}%`,
    top: '-6%',
    '--w': `${w.toFixed(2)}px`,
    '--h': `${w.toFixed(2)}px`,
    '--fall': `${(compact ? rnd(38, 64) : rnd(200, 262)).toFixed(0)}px`,
    '--sway': `${rnd(-9, 9).toFixed(1)}px`,
    '--dur': `${dur.toFixed(1)}s`,
    '--delay': `${(-rnd(0, dur)).toFixed(1)}s`,
    '--blur': '0px',
    // Switches the particle over: `--dot` paints the speck, `--hide` takes the bell and arms away, and
    // the animation and its easing are swapped (snow sinks at a steady rate; it does not pulse).
    '--dot': '1',
    '--hide': '1',
    '--anim': 'cardfx-jelly-mote',
    '--ease': 'linear',
  };
}

/**
 * One animal's arms, as a mask: thick oral arms plus fine tentacles, all tapering, none the same
 * length. Drawn hanging DOWN from the top of its box, which is the edge that tucks under the bell.
 */
function arms(rnd: Rnd): string {
  const W = 100;
  const H = 200;
  const parts: string[] = [];
  // ORAL ARMS — ribbons that taper to a point, each with its own sideways bend, so the bundle has a
  // silhouette instead of a comb's outline.
  const n = 4 + Math.floor(rnd(0, 2.99));
  for (let i = 0; i < n; i++) {
    const x = 26 + ((i + 0.5) * 48) / n + rnd(-5, 5);
    const len = rnd(88, 168);
    const w = rnd(7, 13);
    const bend = rnd(-20, 20);
    parts.push(
      `%3Cpath d='M${(x - w / 2).toFixed(1)},0C${(x - w / 2 + bend * 0.25).toFixed(1)},${(len * 0.45).toFixed(0)} ${(x + bend * 0.8).toFixed(1)},${(len * 0.75).toFixed(0)} ${(x + bend).toFixed(1)},${len.toFixed(0)}C${(x + bend * 0.8 + w * 0.2).toFixed(1)},${(len * 0.75).toFixed(0)} ${(x + w / 2 + bend * 0.25).toFixed(1)},${(len * 0.45).toFixed(0)} ${(x + w / 2).toFixed(1)},0Z'/%3E`,
    );
  }
  // FINE TENTACLES — much longer, much thinner, and they wander. Strokes rather than ribbons: below a
  // pixel or so a filled taper is indistinguishable from a line, and a line is a tenth of the path data.
  const m = 5 + Math.floor(rnd(0, 4.99));
  const threads: string[] = [];
  for (let i = 0; i < m; i++) {
    const x = 20 + rnd(0, 60);
    const len = rnd(120, 198);
    threads.push(
      `%3Cpath d='M${x.toFixed(1)},0c${rnd(-7, 7).toFixed(1)},${(len * 0.3).toFixed(0)} ${rnd(-12, 12).toFixed(1)},${(len * 0.62).toFixed(0)} ${rnd(-16, 16).toFixed(1)},${len.toFixed(0)}' stroke-width='${rnd(0.6, 1.3).toFixed(2)}'/%3E`,
    );
  }
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'%3E%3Cg fill='%23fff'%3E${parts.join('')}%3C/g%3E%3Cg fill='none' stroke='%23fff' stroke-linecap='round'%3E${threads.join('')}%3C/g%3E%3C/svg%3E")`;
}

export const cardJelly: CardEffectModule = {
  id: 'card-jelly',
  type: 'card_effect',
  costDust: 4500,
  since: '2026-08-08',
  className: 'card-fx-jelly',
  // depthCount adds the off-focus planes on TOP of the density we actually want in focus, rather than
  // spending it on them (see ../depth).
  counts: {
    web: SHAFTS + MOTES + depthCount(6),
    overlayCard: SHAFTS + MOTES + depthCount(4),
    overlayChat: SHAFTS + MOTES + depthCount(2),
  },
  labels: { name: 'shop.cardJelly', desc: 'shop.cardJellyDesc' },
  particle: (rnd, compact, index) => {
    if (index < SHAFTS) return shaft(rnd, compact, index);
    if (index < SHAFTS + MOTES) return mote(rnd, compact);
    // The quota starts over at the first animal, so a shoal always gets the same mix of planes
    // whatever the light and the snow cost it.
    const plane = depthPlane(index - SHAFTS - MOTES);
    /**
     * EVERY ANIMAL IS FAR AWAY. The planes still sort them — the quota gives the shoal its layers —
     * but all three bands live under 1, so none of them is a foreground.
     *
     * There WAS a near plane, at 1.2–1.5, and it did not work: size and blur alone do not put
     * something in front. A foreground needs the things a card effect cannot give it — brighter
     * contrast against the card, occluding what is behind, moving visibly faster across the frame — so
     * a big blurred jellyfish just read as a background one drawn larger, and drew attention away from
     * the message for nothing. A shoal seen at a distance is the honest version, and it lets the count
     * go up: small animals can be many.
     */
    const z = plane === 'near' ? rnd(0.86, 1) : plane === 'far' ? rnd(0.44, 0.6) : rnd(0.64, 0.84);
    const w = (compact ? 15 : 34) * z;
    const dur = parallaxDur(BASE_DUR, z, rnd(0.9, 1.12));
    return {
      left: `${rnd(6, 94).toFixed(1)}%`,
      // Starts below the card and climbs out of the top.
      top: '104%',
      '--w': `${w.toFixed(1)}px`,
      // How far it climbs. In px, not a percentage of itself: every animal crosses the same container,
      // so tying the distance to the animal's own size would make the big ones travel further.
      '--rise': `${(compact ? rnd(46, 68) : rnd(190, 250)).toFixed(0)}px`,
      '--sway': `${rnd(-16, 16).toFixed(1)}px`,
      // The arms' idle. Its period is rolled free of the stroke on purpose (see cardfx-jelly-sway):
      // two incommensurate periods never land in the same phase twice, which is what stops the bundle
      // from ever looking parked.
      '--swaydur': `${rnd(3.1, 5.6).toFixed(2)}s`,
      '--swing': `${rnd(2.5, 6).toFixed(1)}deg`,
      '--tent': arms(rnd),
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
      // Blur as a ratio of the animal's own size — capped, and biggest on the FURTHEST (see BLUR_RATIO).
      '--blur': `${Math.min(BLUR_MAX, w * BLUR_RATIO[plane]).toFixed(2)}px`,
      // Aerial perspective: the far ones are fainter as well as smaller. With the blur budget spent
      // down to almost nothing (see BLUR_RATIO), this is what carries the depth — and unlike blur it
      // costs the silhouette nothing.
      '--dim': plane === 'far' ? '0.68' : plane === 'mid' ? '0.9' : '1',
      '--h': `${(w * 2.4).toFixed(1)}px`,
    };
  },
  // A new bundle of arms and a new column each crossing. NOT the size or the duration: speed follows
  // size here (parallaxDur), so re-rolling one without the other would break the depth field — and
  // `--dur` may not change under a running animation anyway.
  respawnKeys: ['--tent', '--sway'],
  css: `
/* THE WATER — a wash that says which way is up, and nothing else. The snow that used to be tiled here
   is a particle now (see MOTES): a tiled constellation repeats across a card and is the same on every
   card in the feed, and both of those are caught by the eye long before the specks read as snow. */
.card-fx-jelly::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      120% 80% at 50% -10%,
      color-mix(in srgb, var(--cos-fx-tint, #9db8ff) 14%, transparent),
      transparent 70%
    ),
    linear-gradient(
      180deg,
      transparent 35%,
      color-mix(in srgb, var(--cos-fx-tint, #9db8ff) 10%, transparent)
    );
  opacity: 0.8;
}
/* THE THREE COLUMNS, one behaviour each — assigned by index, so a card always has all three rather
   than three of a kind. Each animates a DIFFERENT property, which is what keeps them from reading as
   one effect applied three times.
   The wide one just breathes: nothing about its shape changes, only how much light is coming down it. */
@keyframes cardfx-jelly-shaft-lit {
  0%,
  100% {
    opacity: 0.32;
  }
  50% {
    opacity: 0.95;
  }
}
/* The narrow one goes in and out of FOCUS — the surface above it is being disturbed, so the edge of the
   beam is sometimes a line and sometimes a haze. It dims as it softens: a spread beam is a fainter one. */
@keyframes cardfx-jelly-shaft-soft {
  0%,
  100% {
    filter: blur(0.6px);
    opacity: 0.85;
  }
  50% {
    filter: blur(5px);
    opacity: 0.45;
  }
}
/* The middle one FANS: a wave passing overhead spreads it open and squeezes it back. Horizontal only —
   water fans a beam, it does not lengthen it. */
@keyframes cardfx-jelly-shaft-fan {
  0%,
  100% {
    scale: 0.78 1;
    opacity: 0.5;
  }
  50% {
    scale: 1.45 1;
    opacity: 0.82;
  }
}
/* And all three wander sideways, each on its own long period — the sun does not hold still either. */
@keyframes cardfx-jelly-shaft-drift {
  0%,
  100% {
    translate: calc(var(--drift, 5%) * -1) 0;
  }
  50% {
    translate: var(--drift, 5%) 0;
  }
}
/* A SPECK SINKING. Linear, because snow settles at a terminal rate — the animals' easing would give it
   their pulse, which is the one thing a mote must not have. */
@keyframes cardfx-jelly-mote {
  0% {
    opacity: 0;
    transform: translate(0px, 0px);
  }
  12% {
    opacity: 1;
  }
  82% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translate(var(--sway, 0px), var(--fall, 230px));
  }
}
/* THE ANIMAL — bell plus the arms trailing under it. Unmasked, so the glow blooms and the depth blur
   applies to the whole creature (a filter is computed before masking; card-claws shipped a rectangle of
   light learning that). One animation, carrying both the climb and the fade. */
.card-fx-jelly .p {
  width: var(--w, 32px);
  height: var(--h, 77px);
  margin-left: calc(var(--w, 32px) / -2);
  /* ONE BOX, THREE CREATURES. A jellyfish is this element plus its two pseudo-elements; a speck of snow
     and a shaft of light are the same element with the pseudos switched off (--hide) and something else
     painted on the box itself. --bg is the whole background, so a shaft brings its own gradient and
     everyone else falls through to the snow dot — whose alpha is --dot, which an animal never sets, so
     for an animal this background is not there at all.
     (No backticks in these comments: this block is a template literal, and an unescaped one ends it.) */
  border-radius: var(--round, 50%);
  background: var(
    --bg,
    radial-gradient(circle, rgb(255 255 255 / calc(0.55 * var(--dot, 0))) 0 38%, transparent 72%)
  );
  /* Light comes down at a slant; nothing else uses this, so it stays a plain static property. */
  rotate: var(--prot, 0deg);
  /* A vertical fade for the shafts (light dies with depth) and nothing for anyone else. */
  -webkit-mask-image: var(--pmask, none);
  mask-image: var(--pmask, none);
  /* The glow scales with the animal — a fixed 5px halo is right on a 34px bell and a fog around a
     1px speck. */
  filter: blur(var(--blur, 0px))
    drop-shadow(
      0 0 calc(var(--w, 32px) * 0.16) color-mix(in srgb, var(--cos-fx-tint, #9db8ff) 45%, transparent)
    );
  /* THE STROKE IS THIS CURVE, and it is a custom one for a reason that shows immediately if it isn't.
     One stroke = one segment of the keyframes below, so the easing IS the velocity profile. The stock
     keywords all end or begin at ZERO speed — \`ease-in\` starts from a standstill, \`ease-out\` arrives at
     one — which made the animal come to a full stop between every pulse, and nothing in water ever
     stops: it coasts. This bezier's slope at both ends is about 0.3 and 0.25 of the segment's average,
     so the jellyfish is always drifting, and it peaks at 1.4× average at 44% of the stroke — the frame
     the bell is fully squeezed. Drift, push, glide, drift, without a dead frame anywhere.
     (The numbers: dy/dx at t=0 is y1/x1, at t=1 is (1−y2)/(1−x2). Keep both well clear of zero.) */
  /* Name and easing come from vars — a mote and a shaft each swap in their own. The SECOND slot is
     for the shafts' slow wander; everyone else names "none" there, which is a valid animation that
     does nothing, so no other particle pays for it. */
  animation-name: var(--anim, cardfx-jelly-swim), var(--anim2, none);
  animation-duration: var(--dur, 15s), var(--dur2, 30s);
  animation-timing-function: var(--ease, cubic-bezier(0.32, 0.1, 0.6, 0.9)), ease-in-out;
  animation-delay: var(--delay, 0s), var(--delay2, 0s);
  animation-iteration-count: infinite, infinite;
}
/* THE ARMS — painted FIRST, so the bell covers their roots. They hang from inside the dome; the fade
   down the gradient is the arms thinning out rather than being cut off. */
.card-fx-jelly .p::before {
  content: '';
  position: absolute;
  left: 12%;
  right: 12%;
  top: 32%;
  bottom: 0;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--cos-fx-tint, #9db8ff) 85%, #fff),
    var(--cos-fx-tint, #9db8ff) 34%,
    color-mix(in srgb, var(--cos-fx-tint, #9db8ff) 55%, transparent) 74%,
    transparent 96%
  );
  -webkit-mask: var(--tent) center/100% 100% no-repeat;
  mask: var(--tent) center/100% 100% no-repeat;
  /* Switched off entirely on a speck of snow — see --mote on .p. */
  opacity: calc(1 - var(--hide, 0));
  transform-origin: 50% 0;
  /* TWO MOTIONS, TWO PROPERTIES, TWO CLOCKS — and it has to be two, because a bundle of tentacles is
     never still. The stretch (\`scale\`) is locked to the stroke and does go quiet between pushes; on its
     own that left the arms frozen for a third of every cycle, which is exactly when the eye decides it
     is looking at a picture. The sway (\`rotate\`) runs on its OWN rolled period, deliberately unrelated
     to the stroke, so the two never line up twice and there is always something moving.
     Separate transform properties on purpose: one \`transform\` would mean the last rule wins and one of
     them would silently disappear (the lesson NickEffectModule.animation records).
     The stretch also runs a seventh of a stroke BEHIND the bell — arms are pulled taut just after the
     push and gather as the animal slows. */
  animation:
    cardfx-jelly-arms calc(var(--dur, 15s) / ${PULSES}) ease-in-out
      calc(var(--delay, 0s) + var(--dur, 15s) / ${PULSES * 7}) infinite,
    cardfx-jelly-sway var(--swaydur, 4s) ease-in-out var(--delay, 0s) infinite;
}
/* THE BELL — painted LAST, over the arms' roots. Translucent, so what is tucked underneath still shows
   through the dome. */
.card-fx-jelly .p::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: calc(var(--w, 32px) * 0.8);
  border-radius: 50% 50% 44% 44% / 66% 66% 34% 34%;
  background:
    radial-gradient(58% 66% at 50% 86%, rgba(255, 255, 255, 0.7) 0 10%, transparent 58%),
    radial-gradient(
      82% 92% at 50% 22%,
      color-mix(in srgb, var(--cos-fx-tint, #9db8ff) 65%, #fff) 0 28%,
      color-mix(in srgb, var(--cos-fx-tint, #9db8ff) 80%, transparent) 68%,
      transparent 100%
    );
  opacity: calc(1 - var(--hide, 0));
  transform-origin: 50% 100%;
  /* The bell's period IS the climb's divided by PULSES — the lock the whole effect rests on. */
  animation: cardfx-jelly-bell calc(var(--dur, 15s) / ${PULSES}) ease-in-out var(--delay, 0s) infinite;
}
/* THE CLIMB — ${PULSES} strokes, one per segment below, each covering an equal share of the distance.
   THE SHAPE OF A STROKE IS NOT HERE: it is the easing on .p, because one segment IS one stroke (see
   there). That is why this reads as a plain even ladder — the ladder is the distance, the curve is the
   swimming. Trying to carve the surge into extra stops instead is what forced the stock easings, and
   those bring the animal to a dead stop at every stroke boundary.
   The sideways drift shares the stops: transform is a single property, so a stop that set only y would
   snap the animal back to x=0. */
@keyframes cardfx-jelly-swim {
  0% {
    opacity: 0;
    transform: translate(0px, 0px);
  }
  4% {
    opacity: var(--dim, 1);
  }
  16.67% {
    transform: translate(calc(var(--sway, 0px) * 0.1667), calc(var(--rise, 210px) * -0.1667));
  }
  33.33% {
    transform: translate(calc(var(--sway, 0px) * 0.3333), calc(var(--rise, 210px) * -0.3333));
  }
  50% {
    transform: translate(calc(var(--sway, 0px) * 0.5), calc(var(--rise, 210px) * -0.5));
  }
  66.67% {
    transform: translate(calc(var(--sway, 0px) * 0.6667), calc(var(--rise, 210px) * -0.6667));
  }
  83.33% {
    transform: translate(calc(var(--sway, 0px) * 0.8333), calc(var(--rise, 210px) * -0.8333));
  }
  92% {
    opacity: var(--dim, 1);
  }
  100% {
    opacity: 0;
    transform: translate(var(--sway, 0px), calc(var(--rise, 210px) * -1));
  }
}
/* ONE STROKE OF THE BELL. It opens wide and flat, squeezes narrow and deep — that squeeze is the push —
   then springs back open, overshooting a little the way something elastic does. Full contraction lands
   on 44%, which is where the climb's easing peaks: the dome and the surge are one event, and this
   number is the joint between them. Move one, move the other. */
@keyframes cardfx-jelly-bell {
  0% {
    scale: 1.07 0.91;
  }
  44% {
    scale: 0.85 1.19;
  }
  76% {
    scale: 1.1 0.87;
  }
  100% {
    scale: 1.07 0.91;
  }
}
/* The arms follow: stretched out behind on the push, gathering all the way back as the animal coasts.
   The old version finished gathering at 72% and then held — a flat tail that, with easing at both ends,
   left the bundle motionless for roughly a third of every stroke. The return now uses the whole
   remaining time, so the stretch is never parked. */
@keyframes cardfx-jelly-arms {
  0% {
    scale: 1.05 0.95;
  }
  44% {
    scale: 0.88 1.18;
  }
  100% {
    scale: 1.05 0.95;
  }
}
/* THE SWAY — the arms' own idle, on a period rolled per animal and deliberately NOT a fraction of the
   stroke. Its whole job is that the bundle is doing something even when the stretch is at rest: with
   the two periods incommensurate the pair never repeats, so there is no frame in which the tentacles
   are a still image. Small angles — this is drift in the water, not wagging. */
@keyframes cardfx-jelly-sway {
  0%,
  100% {
    rotate: calc(var(--swing, 5deg) * -1);
  }
  50% {
    rotate: var(--swing, 5deg);
  }
}
`,
};
