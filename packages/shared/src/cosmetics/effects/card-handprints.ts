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
 * THE MASKS LIVE IN THE STYLESHEET, not in `particle()`'s output. Each silhouette is ~1.5KB of path
 * data; emitted per particle it would be inlined onto every `.p` of every card, which in the OBS
 * chat worst case is the same kilobytes copied hundreds of times. Six are declared once here and a
 * particle just picks one by name.
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
  // Palm — the second subpath is the hollow (see the note above on fill-rule).
  'M 540,660 C 585,642 645,655 690,688 C 730,718 775,738 830,742 C 890,746 945,762 995,795 C 1050,830 1100,872 1122,925 C 1145,982 1138,1048 1120,1112 C 1100,1180 1082,1245 1055,1300 C 1028,1358 988,1405 935,1420 C 878,1436 812,1428 752,1405 C 685,1380 620,1340 565,1292 C 508,1242 460,1182 428,1115 C 396,1048 375,975 368,905 C 362,852 378,805 405,775 C 432,745 470,720 505,700 C 520,690 530,672 540,660 Z M 705,935 C 750,918 808,925 848,952 C 882,975 895,1018 878,1062 C 862,1105 820,1135 775,1133 C 728,1131 690,1104 676,1058 C 662,1012 672,958 705,935 Z',
];

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
    `%3CfeTurbulence type='fractalNoise' baseFrequency='0.011' numOctaves='3' seed='${seed}' result='n'/%3E` +
    `%3CfeDisplacementMap in='SourceGraphic' in2='n' scale='30' xChannelSelector='R' yChannelSelector='G'/%3E` +
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
    const dur = rnd(6.5, 9.5);
    return {
      left: `${rnd(12, 88).toFixed(1)}%`,
      top: `${rnd(22, 80).toFixed(1)}%`,
      '--w': `${w.toFixed(1)}px`,
      '--h': `${(w * ASPECT).toFixed(1)}px`,
      // Barely tilted: a hand pressed flat on glass stays roughly upright, and steep angles were
      // one of the things that made early passes read as stickers dropped onto the card.
      '--rot': `${rnd(-14, 14).toFixed(1)}deg`,
      '--hand': `var(--hand-${1 + Math.floor(rnd(0, MASK_COUNT))})`,
      '--dur': `${dur.toFixed(2)}s`,
      // Phase from vdc(index), not a roll: independent draws clump, and two prints landing together
      // by accident reads as one event stuttering rather than two hands. vdc spreads evenly for ANY
      // count, which is what lets a chat pill run three while a card runs four (see ../spread).
      '--delay': `${(-vdc(index) * dur).toFixed(2)}s`,
    };
  },
  // Everything about WHERE and WHICH hand is re-rolled each cycle; `--dur` is not (it may not change
  // under a running animation) and neither is anything tied to it. Size is safe here precisely
  // because a print does not travel — nothing about its speed follows from how big it is.
  respawnKeys: ['top', '--w', '--h', '--rot', '--hand'],
  css: `
${maskVars.length ? `.card-fx-handprints {\n${maskVars}\n}` : ''}
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
.card-fx-handprints .p::before {
  content: '';
  position: absolute;
  inset: 0;
  /* The hollow palm lives in the mask's own geometry, so this only varies pressure gently. A print
     is a greasy film: nothing here goes near full alpha. */
  background: radial-gradient(
    ellipse 62% 54% at 52% 78%,
    color-mix(in srgb, var(--cos-fx-tint, #dcf2ff) 54%, transparent) 0%,
    color-mix(in srgb, var(--cos-fx-tint, #dcf2ff) 47%, transparent) 55%,
    color-mix(in srgb, var(--cos-fx-tint, #dcf2ff) 34%, transparent) 100%
  );
  -webkit-mask-image: var(--hand);
  mask-image: var(--hand);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  /* Only a breath of softness: the ragged edge comes from the mask's own displacement, and blurring
     harder sands off exactly the detail that makes it read as grease rather than a cut silhouette. */
  filter: blur(0.5px);
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
  22% {
    opacity: 0.92;
  }
  55% {
    opacity: 0.4;
  }
  82% {
    opacity: 0.12;
  }
  100% {
    opacity: 0;
  }
}
`,
};
