import type { CardEffectModule } from '../types';
import { vdc } from '../spread';

/**
 * The card is a pane of glass and something on the OTHER side keeps pressing its hands against it.
 * A print lands instantly, holds, and is slowly reclaimed by the condensation. Then another, else-
 * where. Whoever is doing it is never shown — only that they are still there.
 *
 * THE ENVELOPE IS THE WHOLE EFFECT, and it is the one thing that must not be softened. A print goes
 * from nothing to full strength in 1.5% of its cycle (~100ms): a press is an IMPACT. Fade it in over
 * even half a second and the effect instantly reads as "the window is fogging up" — which is exactly
 * the note that killed the earlier ink attempt. Only the LEAVING is slow. Fast in, slow out.
 *
 * That speed is also why the cycle opens with a blind 2% at opacity 0 — an instant entrance is the
 * one case where the respawn's timing shows. See the keyframes for the full reasoning.
 *
 * THEN IT GIVES WAY. After holding a third of the cycle the hand slides down the glass, drawing a
 * streak out from under each finger. The pause before it moves is doing the work: a print that starts
 * sliding on contact is just a shape drifting past, while one that lands, stays, and only then slips
 * says something is holding on out there and losing its grip. A quarter of them barely move at all,
 * so a card is never uniformly sliding.
 *
 * THE HAND OUTLIVES ITS OWN JOURNEY. Its opacity has to stay up until the slip is nearly finished,
 * because `.p` owns the envelope and that envelope multiplies into the smear as well — fade the hand
 * early and the trail it is drawing fades with it, leaving an effect that technically has a smear
 * and visibly does not.
 *
 * THE ANATOMY IS AUTHORED, NOT GENERATED, and three discarded attempts paid for that line. Building
 * the hand from primitives — first tapered bars, then a column of contact pads — produced a glove
 * and then a scatter of ovals, because a hand is not a shape a formula finds: the fingers taper and
 * lean differently, the phalanx creases fall at uneven heights, and the palm's hollow sits off
 * centre. So the outlines below are fixed and traced, and variety comes from the noise seed, the
 * mirror, the size and the placement instead of from re-rolling the geometry.
 *
 * THE RAGGED EDGE IS A FILTER OVER A CORRECT OUTLINE, never the source of the shape. feTurbulence
 * roughens an anatomically right silhouette into ink; used the other way round — turbulence AS the
 * form — is what made the old ink effect read as frost on a window.
 *
 * THE HOLLOW IS PART OF THE OUTLINE. The palm's empty centre is a second subpath under `fill-rule:
 * evenodd`, not something the fill gradient fakes: a gradient can only dim the middle, and a dimmed
 * middle still reads as a solid palm. A real hand does not touch glass there at all.
 *
 * SHAPE AND TEXTURE ARE TWO SEPARATE MASK LAYERS, and splitting them is what buys variety cheaply.
 * The silhouettes are six fixed masks in the stylesheet (a particle picks one by name) because each
 * is ~1.5KB of path data and a per-particle data-URI would be both inlined onto every `.p` AND
 * rasterised separately — hundreds of turbulence passes in an OBS chat. The ink texture is one
 * repeating tile every print shares, sampled at its own random `mask-position`, so patchiness varies
 * CONTINUOUSLY while the browser still decodes exactly one noise image. Intersecting the two gives
 * "same hand, different ink" without paying for a unique mask per print.
 *
 * SIZE IS ABSOLUTE, never a fraction of the container: a chat pill gets the same hand as a tall card
 * and simply clips it (the rule the catalog already settled on — an effect shrunk to fit a short row
 * is an effect nobody can see).
 */

/** The traced print, as SVG path data in a 1400x1430 box. See the note above on why it is fixed. */
const HAND_PARTS = [
  // Thumb — a fat diagonal blob, detached from the palm.
  'M 30,830 C 20,790 55,762 105,775 C 158,789 215,830 258,880 C 298,927 315,975 300,1015 C 286,1052 240,1062 195,1042 C 145,1020 95,975 62,925 C 38,888 35,855 30,830 Z',
  // Index — two phalanx blocks with a dry crease between them.
  'M 405,215 C 400,165 425,120 470,105 C 515,92 555,115 565,160 C 575,205 570,250 560,295 C 552,330 500,345 460,330 C 420,315 410,265 405,215 Z',
  'M 455,375 C 460,350 505,340 545,352 C 585,364 600,400 605,445 C 612,505 620,560 615,610 C 610,650 570,668 530,655 C 492,643 480,600 472,555 C 464,500 450,430 455,375 Z',
  // Middle — the longest finger, three clear segments.
  'M 745,110 C 745,55 780,15 830,20 C 875,25 895,70 890,120 C 885,170 875,205 860,225 C 840,250 785,248 765,225 C 748,205 745,155 745,110 Z',
  'M 750,300 C 748,265 775,238 815,240 C 855,242 875,270 875,310 C 875,350 868,378 855,395 C 840,415 790,415 772,395 C 756,377 752,338 750,300 Z',
  'M 762,455 C 762,425 790,405 822,408 C 856,411 868,438 866,470 C 864,502 858,525 845,540 C 830,556 790,554 776,538 C 763,523 762,485 762,455 Z',
  // Ring — leans back toward the middle finger as it descends.
  'M 985,470 C 975,410 990,330 1010,265 C 1030,200 1055,150 1090,138 C 1125,126 1160,155 1162,205 C 1164,255 1145,320 1120,385 C 1098,443 1080,490 1060,510 C 1035,535 995,520 985,470 Z',
  'M 960,560 C 958,530 985,510 1018,515 C 1050,520 1062,548 1058,580 C 1054,612 1040,632 1020,638 C 998,644 975,630 967,608 C 960,588 960,570 960,560 Z',
  // Pinky — shortest, set lowest, angled hardest away from the hand.
  'M 1160,760 C 1145,720 1175,655 1215,590 C 1258,520 1300,450 1330,415 C 1358,382 1390,395 1392,435 C 1394,478 1360,545 1320,615 C 1282,682 1245,745 1215,775 C 1188,802 1172,795 1160,760 Z',
  // Palm — the subpaths after the outline are the parts that never touch (see the note on fill-rule).
  //
  // THE LEFT EDGE NARROWS AS IT RISES, and that is anatomy, not styling. Above the thumb sits the
  // thumb web, so the palm is at its WIDEST low down at the heel and gets steadily narrower toward
  // the index base. The first cut had the outline bulging out to x=362 at y=850 — its widest point
  // was up in the web — which put a lump on the silhouette exactly above the thumb.
  //
  // THE CUP IS A TAPERED WEDGE, NOT A RING. It began as five arcs of what was effectively an
  // ellipse, and a round hole in the middle of a solid shape reads as a doughnut no matter how the
  // edge is roughened. A palm's untouched area is bounded by the thenar, the hypothenar, the finger
  // pads and the heel, so it is broad at the top and closes to about half that at the bottom — that
  // 2:1 taper is what stops the eye calling it a hole. The small second void along the thumb mound
  // finishes the job: two unequal gaps read as skin that missed, one centred gap reads as a ring.
  'M 540,660 C 585,642 645,655 690,688 C 730,718 775,738 830,742 C 890,746 945,762 995,795 C 1050,830 1100,872 1122,925 C 1145,982 1138,1048 1120,1112 C 1100,1180 1082,1245 1055,1300 C 1028,1358 988,1405 935,1420 C 878,1436 812,1428 752,1405 C 685,1380 620,1340 565,1292 C 505,1240 445,1180 410,1108 C 392,1070 380,1025 386,978 C 396,916 420,862 458,812 C 488,772 520,715 540,660 Z M 690,900 C 748,880 818,896 862,936 C 882,956 884,992 876,1024 C 866,1060 846,1094 812,1112 C 786,1126 750,1128 726,1116 C 714,1110 710,1080 712,1040 C 714,1006 700,988 682,976 C 664,962 662,922 690,900 Z M 520,1010 C 542,1002 560,1022 562,1054 C 564,1084 556,1108 540,1114 C 524,1120 510,1104 506,1076 C 502,1048 504,1018 520,1010 Z',
];

/**
 * THE DRAG STREAKS — one column per finger: `[centreX, width, tipY]` in the same 1400-wide space as
 * the hand, so a streak sits under the finger that drew it and starts at that finger's own tip.
 *
 * Each bar runs from its tip to the BOTTOM of the box. That length is not what gets drawn — see
 * STREAK_MASK for how a bar is cut down to just the part the finger has actually vacated.
 */
const STREAKS: [number, number, number][] = [
  [180, 130, 790], // thumb — widest contact, set low and off to the side
  [535, 126, 110], // index
  [815, 116, 25], // middle — the longest finger, so the highest start
  [1012, 104, 140], // ring
  [1270, 100, 400], // pinky — shortest, and its tip sits well down the hand
];

/**
 * The streak columns. Plain bars, no fade: the reveal is not done by this image.
 *
 * HOW A STREAK GETS ITS LENGTH. This mask is applied TWICE — once anchored, once offset downward by
 * however far the hand has slid — and the two are combined with `mask-composite: subtract`. What
 * survives is the anchored copy minus the offset copy, which is exactly the strip each column has
 * been vacated by: nothing at all before the hand moves, and a bar growing from that finger's tip
 * as it slides.
 *
 * This replaces two earlier attempts that both failed on the same point — having no way to be zero
 * length at the start. Stretching the hand mask read as a squashed palm once the travel got long;
 * stretching full-height BARS was worse, because at rest they already covered the whole print and
 * the effect flashed up a set of stripes the moment the slide began. Subtracting a shifted copy is
 * the one formulation where "hasn't moved yet" and "no streak yet" are the same state.
 *
 * `preserveAspectRatio='none'` so the columns track the element's box rather than being letterboxed.
 */
const STREAK_MASK =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1400 1430' preserveAspectRatio='none'%3E` +
  STREAKS.map(
    ([cx, w, tip]) =>
      `%3Crect x='${(cx - w / 2).toFixed(0)}' y='${tip}' width='${w}' height='${1430 - tip}' fill='%23fff'/%3E`,
  ).join('') +
  `%3C/svg%3E")`;

/** Print aspect — the mask's own box. Height follows width so a hand never squashes. */
const ASPECT = 1430 / 1400;

/** How many silhouettes are declared in the stylesheet (3 noise seeds x 2 mirrors). */
const MASK_COUNT = 6;

/**
 * One print as a mask. `flip` mirrors INSIDE the svg rather than through a CSS transform: `.p`
 * already animates `scale` in its press keyframes, and a second writer of that one property would
 * silently win or lose depending on rule order.
 */
function handMask(seed: number, flip: boolean): string {
  const g = flip ? " transform='translate(1400,0) scale(-1,1)'" : '';
  const filter =
    `%3Cfilter id='r' filterUnits='userSpaceOnUse' x='-60' y='-60' width='1520' height='1550'%3E` +
    // 1) The ragged ink edge: warp the authored outline so no border is a drawn curve.
    `%3CfeTurbulence type='fractalNoise' baseFrequency='0.011' numOctaves='3' seed='${seed}' result='warp'/%3E` +
    `%3CfeDisplacementMap in='SourceGraphic' in2='warp' scale='30' xChannelSelector='R' yChannelSelector='G'/%3E` +
    `%3C/filter%3E`;
  const paths = HAND_PARTS.map((d) => `%3Cpath d='${d}'/%3E`).join('');
  return (
    `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1400 1430'%3E` +
    filter +
    `%3Cg fill='%23fff' fill-rule='evenodd' filter='url(%23r)'${g}%3E${paths}%3C/g%3E%3C/svg%3E")`
  );
}

const SEEDS = [7, 29, 61];
const maskVars = SEEDS.map((seed, i) =>
  [handMask(seed, false), handMask(seed, true)]
    .map((url, f) => `  --hand-${i * 2 + f + 1}: ${url};`)
    .join('\n'),
).join('\n');

/**
 * Side of the ink tile, in px. Every print samples a random window of it (see INK_TILE), so how many
 * visibly different textures exist is (TILE/print)^2 rather than a count of pre-baked variants.
 */
const INK_TILE_PX = 400;

/**
 * THE INK TEXTURE, as ONE tile every print shares.
 *
 * Ink density used to be baked into each hand mask, which meant patchiness could only vary as far as
 * the pre-baked silhouettes did — six textures, forever. Emitting a unique mask per particle would
 * fix the variety and wreck the cost: every distinct data-URI is its own rasterisation, and each one
 * runs a turbulence pass, so an OBS chat would be decoding hundreds of them.
 *
 * Splitting the texture off solves both. It is a SECOND MASK LAYER intersected with the hand, so the
 * browser decodes exactly one noise image no matter how many prints exist, while each print picks
 * its own `mask-position` into it — a continuous offset, not a choice from a list.
 *
 * `stitchTiles='stitch'` is what makes that legal: it forces the noise to meet itself seamlessly at
 * the tile edge, so `mask-repeat: repeat` can run the field on forever and no offset lands on a seam.
 *
 * 1 tile unit = 1 device px (mask-size below matches the viewBox), so baseFrequency reads directly as
 * patch size: 0.2 puts a blotch every ~5px, which is the scale that reads as skin that missed rather
 * than as dither. The table is steep because fractalNoise crowds around 0.5 — a gentle curve left the
 * print with literally zero voids.
 */
const INK_TILE =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${INK_TILE_PX} ${INK_TILE_PX}'%3E` +
  `%3Cfilter id='i' filterUnits='userSpaceOnUse' x='0' y='0' width='${INK_TILE_PX}' height='${INK_TILE_PX}'%3E` +
  `%3CfeTurbulence type='fractalNoise' baseFrequency='0.2' numOctaves='3' seed='23' stitchTiles='stitch' result='g'/%3E` +
  `%3CfeColorMatrix in='g' type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 1 0 0 0 0' result='ga'/%3E` +
  `%3CfeComponentTransfer in='ga'%3E%3CfeFuncA type='table' tableValues='0 0 0 0.08 0.48 0.82 1 1 1 1 1'/%3E%3C/feComponentTransfer%3E` +
  `%3C/filter%3E` +
  `%3Crect width='${INK_TILE_PX}' height='${INK_TILE_PX}' fill='%23fff' filter='url(%23i)'/%3E%3C/svg%3E")`;

export const cardHandprints: CardEffectModule = {
  id: 'card-handprints',
  type: 'card_effect',
  costDust: 5000,
  since: '2026-08-09',
  className: 'card-fx-handprints',
  // Few and large on purpose: several small prints read as scattered clip-art, a couple of big faint
  // ones read as something person-sized leaning on the other side of the glass.
  counts: { web: 4, overlayCard: 4, overlayChat: 3 },
  labels: { name: 'shop.cardHandprints', desc: 'shop.cardHandprintsDesc' },
  // Painted from the LAYER tint (--cos-fx-tint, set by fillCardEffect) with a default, so adding a
  // colour upgrade later is a new catalog entry and nothing else — no change in here.
  particle: (rnd, _compact, index) => {
    const w = rnd(52, 74);
    const h = w * ASPECT;
    const dur = rnd(6.5, 9.5);
    // Not every hand slips: a quarter of them only creep, which stops a card from looking like
    // everything on it is sliding in formation. A quarter and not a third because a card carries
    // just four prints — at one in three, a fifth of all cards would show barely any movement at all.
    //
    // The travel is roughly a third to two thirds of the print's own height. Shorter than this and
    // the smear never grows long enough to read as a streak rather than a soft edge under the hand.
    const slide = rnd(0, 1) < 0.25 ? rnd(7, 15) : rnd(26, 60);
    return {
      left: `${rnd(12, 88).toFixed(1)}%`,
      // Biased toward the upper half so the slip has somewhere to go: a print that starts low spends
      // its whole journey being clipped by the card's bottom edge, trail and all.
      top: `${rnd(16, 66).toFixed(1)}%`,
      '--w': `${w.toFixed(1)}px`,
      '--h': `${h.toFixed(1)}px`,
      '--slide': `${slide.toFixed(1)}px`,
      // Barely tilted: a hand pressed flat on glass stays roughly upright, and steep angles were
      // one of the things that made early passes read as stickers dropped onto the card.
      '--rot': `${rnd(-14, 14).toFixed(1)}deg`,
      '--hand': `var(--hand-${1 + Math.floor(rnd(0, MASK_COUNT))})`,
      // Where this print reads the shared ink field. A continuous offset rather than a pick from a
      // list, so two prints sharing a silhouette still carry different blotches.
      '--ink-pos': `${rnd(0, INK_TILE_PX).toFixed(0)}px ${rnd(0, INK_TILE_PX).toFixed(0)}px`,
      '--dur': `${dur.toFixed(2)}s`,
      // Phase from vdc(index), not a roll: independent draws clump, and two prints landing together
      // by accident reads as one event stuttering rather than two hands. vdc spreads evenly for ANY
      // count, which is what lets a chat pill run three while a card runs four (see ../spread).
      '--delay': `${(-vdc(index) * dur).toFixed(2)}s`,
    };
  },
  // Everything about WHERE, WHICH hand and HOW FAR it slips is re-rolled each cycle; `--dur` is not
  // (it may not change under a running animation). `--slide` is safe despite setting the slip's
  // speed, because it only ever changes at a cycle boundary, where the slip restarts anyway.
  respawnKeys: ['top', '--w', '--h', '--rot', '--hand', '--ink-pos', '--slide'],
  css: `
.card-fx-handprints {
${maskVars}
  --ink: ${INK_TILE};
  --streak: ${STREAK_MASK};
}
/* THE CONDENSATION FILM — deliberately near-invisible. It exists only so the prints have something
   to be prints IN; any heavier and this becomes the frosting-window read that sank the ink effect.
   Carries no animation, so it survives as a still layer rather than leaving a bare card. */
.card-fx-handprints::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      ellipse 120% 80% at 30% 15%,
      color-mix(in srgb, var(--cos-fx-tint, #dcf2ff) 5%, transparent),
      transparent 65%
    ),
    radial-gradient(
      ellipse 100% 70% at 80% 90%,
      color-mix(in srgb, var(--cos-fx-tint, #dcf2ff) 3.5%, transparent),
      transparent 60%
    );
}
/* ONE PRINT. \`.p\` is UNMASKED and owns position, rotation and the envelope — a filter is computed
   BEFORE masking, so a glow put on the masked pseudo below would be cropped to that mask's own box
   (the trap card-claws documents at length). */
.card-fx-handprints .p {
  width: var(--w);
  height: var(--h);
  margin: calc(var(--h) / -2) 0 0 calc(var(--w) / -2);
  rotate: var(--rot);
  animation: cardfx-hand-press var(--dur, 8s) linear var(--delay, 0s) infinite;
}
.card-fx-handprints .p::before,
.card-fx-handprints .p::after {
  content: '';
  position: absolute;
  inset: 0;
}
/* THE HAND. It holds where it landed, then gives way and slides.

   TWO MASK LAYERS, INTERSECTED: the hand says WHERE, the ink tile says HOW MUCH. The second layer
   repeats and is offset per print (--ink-pos), which is what makes the patchiness continuous instead
   of one of six baked-in textures — and it costs a single decoded image for the whole catalog. The
   streaks below read the SAME ink window, so a trail carries the same grain as the hand that left it. */
.card-fx-handprints .p::before {
  -webkit-mask-image: var(--hand), var(--ink);
  mask-image: var(--hand), var(--ink);
  -webkit-mask-size: 100% 100%, ${INK_TILE_PX}px ${INK_TILE_PX}px;
  mask-size: 100% 100%, ${INK_TILE_PX}px ${INK_TILE_PX}px;
  -webkit-mask-position: 0 0, var(--ink-pos, 0 0);
  mask-position: 0 0, var(--ink-pos, 0 0);
  -webkit-mask-repeat: no-repeat, repeat;
  mask-repeat: no-repeat, repeat;
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  /* Above its own streaks: the trail is something the hand LEFT, so it cannot paint over it. Both
     pseudos sit in the stacking context .p already creates by animating opacity. */
  z-index: 1;
  /* The hollow palm lives in the mask's own geometry, so this only varies pressure gently. A print
     is a greasy film: nothing here goes near full alpha.

     These numbers are ~1.25x what they were before the mask gained its ink-density stage. That stage
     cut mean coverage from 0.80 to 0.64, which would otherwise have shipped as "the effect got
     weaker" rather than "the effect got texture" — the point was to trade evenness for patchiness at
     the same overall presence, not to fade the print. */
  background: radial-gradient(
    ellipse 62% 54% at 52% 78%,
    color-mix(in srgb, var(--cos-fx-tint, #dcf2ff) 67%, transparent) 0%,
    color-mix(in srgb, var(--cos-fx-tint, #dcf2ff) 59%, transparent) 55%,
    color-mix(in srgb, var(--cos-fx-tint, #dcf2ff) 42%, transparent) 100%
  );
  /* Only a breath of softness: the ragged edge comes from the mask's own displacement, and blurring
     harder sands off exactly the detail that makes it read as grease rather than a cut silhouette. */
  filter: blur(0.5px);
  /* The S-curve is load-bearing twice over. It grips, gives way, then settles — but it also has to
     put half the travel in the first half of the slip, because the hand starts dimming at 64% and a
     back-loaded ease-in spent the bright half of the journey barely moving (18% of the distance) and
     then covered the rest while fading. The smear below MUST carry the identical easing or its
     trailing edge parts company with the hand. */
  animation: cardfx-hand-slip var(--dur, 8s) cubic-bezier(0.45, 0, 0.55, 1) var(--delay, 0s) infinite;
}
/* THE DRAG STREAKS — one per finger, growing out from under it as the hand slips.

   THREE MASK LAYERS, and the middle pair is the whole mechanism. Listed top-first, they are:
     ink       intersect  — the shared grain, so a streak is textured like the hand that left it
     streaks   subtract   — the columns, anchored
     streaks   (base)     — the same columns, offset down by however far the hand has slid
   Subtract keeps the part of the anchored copy that the offset copy does NOT cover, which is exactly
   the strip each finger has vacated: empty while the hand is still, growing from the fingertip once
   it moves. No scaling anywhere, so nothing can deform, and the streak simply cannot exist before
   there is travel to justify it.

   Nearly flat fill on purpose: the streak's own variation comes from the ink layer, and a strong
   gradient over the box would light the columns by where they sit rather than by how old they are. */
.card-fx-handprints .p::after {
  -webkit-mask-image: var(--ink), var(--streak), var(--streak);
  mask-image: var(--ink), var(--streak), var(--streak);
  -webkit-mask-size: ${INK_TILE_PX}px ${INK_TILE_PX}px, 100% 100%, 100% 100%;
  mask-size: ${INK_TILE_PX}px ${INK_TILE_PX}px, 100% 100%, 100% 100%;
  -webkit-mask-repeat: repeat, no-repeat, no-repeat;
  mask-repeat: repeat, no-repeat, no-repeat;
  -webkit-mask-composite: source-in, source-out, source-over;
  mask-composite: intersect, subtract, add;
  background: linear-gradient(
    to bottom,
    color-mix(in srgb, var(--cos-fx-tint, #dcf2ff) 20%, transparent) 0%,
    color-mix(in srgb, var(--cos-fx-tint, #dcf2ff) 28%, transparent) 100%
  );
  filter: blur(0.9px);
  /* Identical easing to the slip above — see the note there. */
  animation: cardfx-hand-smear var(--dur, 8s) cubic-bezier(0.45, 0, 0.55, 1) var(--delay, 0s) infinite;
}
/* Fast in, slow out — see the note at the top. The scale settle is the glass flexing under the push;
   it is over almost as soon as it starts, which is what sells the press as an impact.

   THE DEAD 2% AT THE START IS NOT SPARE TIME. bindRespawn moves a print to its next place on the
   \`animationiteration\` event, which is dispatched a frame or two AFTER the new cycle has already
   begun drawing. Most effects open at opacity 0 and fade in slowly, so that gap never shows — but
   this one goes to full strength in ~100ms, and card-claws (the only other instant entrance here)
   already paid for the lesson: without a blind head start the print lands at the OLD position,
   THEN snaps to the new one, and a fast two-position jump reads as the hand flying into place.
   Worse here than for claws, because respawn re-rolls the size and rotation too. 2% is 130-190ms
   at these durations — a dozen frames of cover for an event that needs one. */
@keyframes cardfx-hand-press {
  0%,
  2% {
    opacity: 0;
    scale: 1.07;
  }
  3.5% {
    opacity: 1;
    scale: 1.01;
  }
  6% {
    scale: 1;
  }
  /* THE PLATEAU RUNS THROUGH THE SLIDE, and that is the difference between an effect with a trail
     and an effect that appears to have none. The envelope inherited from the press-and-fade version
     was down to 0.4 by 55% and all but gone by 82% — but the particle's opacity multiplies into BOTH
     pseudo-elements, so the hand dimmed through the whole journey, taking its own smear with it. Nothing
     was left to see by the time there was any trail to look at. The hand now stays strong until the
     slip is most of the way done and only lets go over the last third. */
  64% {
    opacity: 0.94;
  }
  82% {
    opacity: 0.68;
  }
  94% {
    opacity: 0.2;
  }
  100% {
    opacity: 0;
  }
}
/* THE SLIP. It holds for the first third — that pause is the whole point, because a hand that starts
   moving on contact reads as a shape drifting past, while one that stays put and THEN gives way
   reads as weight losing its grip. ease-in for the same reason: it must not set off at speed. */
@keyframes cardfx-hand-slip {
  0%,
  30% {
    translate: 0 0;
  }
  100% {
    translate: 0 var(--slide, 0px);
  }
}
/* The streaks grow by moving the SUBTRACTED copy of the columns down by exactly the distance the
   hand has travelled — same duration, delay and easing as the slip, so a streak's far end cannot
   drift away from the finger drawing it. At rest the two copies sit on top of each other and cancel
   out completely, which is what makes "hasn't moved" and "no streak" the same state. */
@keyframes cardfx-hand-smear {
  0%,
  30% {
    -webkit-mask-position: var(--ink-pos, 0 0), 0 0, 0 0;
    mask-position: var(--ink-pos, 0 0), 0 0, 0 0;
    opacity: 0;
  }
  40% {
    opacity: 1;
  }
  100% {
    -webkit-mask-position: var(--ink-pos, 0 0), 0 0, 0 var(--slide, 0px);
    mask-position: var(--ink-pos, 0 0), 0 0, 0 var(--slide, 0px);
    opacity: 1;
  }
}
`,
};
