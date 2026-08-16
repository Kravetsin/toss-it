import type { SealModule } from '../types';

/**
 * The Keyring: the BREADTH axis as a collection — keys, each picked up somewhere else. Earn
 * condition absent on purpose (see `draft`): the metric is "how many DIFFERENT channels".
 *
 * Every hanger is a KEY, and the variety lives in the bow and the bit — the parts that actually
 * differ between real keys. Swapping some of them for discs and tags was the first take: it gave a
 * livelier silhouette and stopped the object being a keyring at all.
 *
 * A bow drawn as an OUTLINE over a solid blade is what keeps a key reading as a key once it is two
 * pixels wide in the chat gutter; a fully solid key is a splinter at that size.
 *
 * The bunch rocks and each key swings against it a beat later — that lag is the jingle, and it is the
 * only motion here. One clock: every key runs the same period, only the phase differs.
 *
 * Two rungs, and here the DENSITY is almost the condition itself: a couple of keys against a full
 * bunch. Deliberately two and five rather than a countable one-per-channel — an exact tally invites
 * reading the seal as a number, which the set does not do (see the core's uneven ring).
 */

/** Hoop centre and radius, plus the shared period of the rock and the swings. */
const KR = { x: 12, y: 6.0, r: 3.5, sway: 3.4 };
const SWAY_FEW = 5.2;

const BOW_ROUND = '<circle class="kr-o" cx="0" cy="1.05" r="1.15"/>';
const BOW_OVAL = '<ellipse class="kr-o" cx="0" cy="1.15" rx="0.95" ry="1.3"/>';
const BOW_SQUARE = '<rect class="kr-o" x="-1.15" y="-0.1" width="2.3" height="2.3" rx="0.55"/>';

/**
 * Bodies are drawn in LOCAL coords hanging from (0,0) — the pivot on the hoop — so one static
 * translate+rotate places a key and the CSS only ever adds the swing.
 */
const KEYS = [
  // Long house key: a straight blade with three notches down one edge.
  {
    s: 46,
    bow: BOW_ROUND,
    body:
      '<path class="kr-b" d="M-0.42 2.2 H0.42 V6.4 H1.62 V7.25 H0.42 V8.35 H1.8 V9.2 H0.42 ' +
      'V10.2 H1.5 V11.05 H0.42 V11.8 H-0.42 Z"/>',
  },
  // Ward key: a long thin shank ending in one heavy bit — the silhouette that survives 15px best.
  {
    s: 23,
    bow: BOW_OVAL,
    body: '<path class="kr-b" d="M-0.36 2.45 H0.36 V8.6 H2.35 V9.5 H1.35 V10.25 H2.35 V11.3 H-0.36 Z"/>',
  },
  // Double-sided key: teeth on both edges, so it still reads as a key as a 2px sliver.
  {
    s: -3,
    bow: BOW_SQUARE,
    body:
      '<path class="kr-b" d="M-0.44 2.3 H0.44 V5.5 H1.5 V6.3 H0.44 V7.4 H1.62 V8.2 H0.44 ' +
      'V10.4 H-0.44 V9.3 H-1.62 V8.5 H-0.44 V7.2 H-1.5 V6.4 H-0.44 Z"/>',
  },
  // Short stubby key, one tooth on the far edge.
  {
    s: -25,
    bow: BOW_ROUND,
    body: '<path class="kr-b" d="M-0.4 2.2 H0.4 V8.6 H-0.4 V7.5 H-1.7 V6.6 H-0.4 Z"/>',
  },
  // Tubular key: a cross bit at the tip instead of a toothed edge.
  {
    s: -50,
    bow: BOW_OVAL,
    body:
      '<path class="kr-b" d="M-0.38 2.45 H0.38 V7.9 H1.85 V8.85 H0.38 V10.6 H-0.38 V8.85 ' +
      'H-1.85 V7.9 H-0.38 Z"/>',
  },
].map((h, i) => ({
  ...h,
  i,
  px: Number((KR.x - KR.r * Math.sin((h.s * Math.PI) / 180)).toFixed(2)),
  py: Number((KR.y + KR.r * Math.cos((h.s * Math.PI) / 180)).toFixed(2)),
  // Keys run roughly against the hoop's rock, each lagging the one before — that is the jingle.
  delay: Number((-(0.52 + 0.06 * i) * KR.sway).toFixed(2)),
}));

/** The lower rung's bunch: the two keys whose silhouettes differ most, one hanging each side of the
 *  hoop, so a pair still reads as a bunch rather than as one key with a spare. */
const FEW = [1, 3];

const hung = (lit: boolean) => KEYS.filter((h) => lit || FEW.includes(h.i));

/** Shared shell for both rungs; only how much hangs on the hoop and how slowly it swings differ. */
function keyring(rung: {
  id: string;
  className: string;
  lit: boolean;
  /** Channels the viewer must have been seen moderating. The only breadth family with no per-channel
   *  bar: wearing the badge IS the bar, so the rung climbs on the channel count itself. */
  channels: number;
}): SealModule {
  const c = rung.className;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'channelsModerated', count: rung.channels },
    since: '2026-08-16',
    colorUpgrade: 'seal-keyring-color',
    ladder: 'seal-keyring',
    className: c,
    labels: { name: 'shop.sealKeyring', desc: 'shop.sealKeyringDesc' },
    svg:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><g class="kr-all">' +
      `<circle class="kr-hoop" cx="${KR.x}" cy="${KR.y}" r="${KR.r}"/>` +
      hung(rung.lit)
        .map(
          (h) =>
            `<g class="kr-h kr-h${h.i}" style="animation-delay:${h.delay}s">` +
            `<g transform="translate(${h.px} ${h.py}) rotate(${h.s})">` +
            `${h.bow}${h.body}</g></g>`,
        )
        .join('') +
      '</g></svg>',
    css: `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names cannot collide
   with anything outside a seal. Emitted by each rung; the duplicate in the sheet is inert. */
.seal-fx .kr-hoop {
  fill: none;
  stroke: #ffffff;
  stroke-width: 1.05;
}
/* Outline bow over a solid blade: that contrast is what keeps a 2px sliver reading as a key. */
.seal-fx .kr-o {
  fill: none;
  stroke: var(--seal-tint, #8df0cc);
  stroke-width: 0.7;
}
.seal-fx .kr-b {
  fill: var(--seal-tint, #8df0cc);
}
.seal-fx .kr-all {
  transform-box: view-box;
  transform-origin: 12px 3.2px;
  animation: seal-keyring-rock ${KR.sway}s ease-in-out infinite;
}
/* A key swings about its OWN pivot on the hoop, so the origin is given in root viewBox coords per
   key — inside a nested group a transform-box origin would be ambiguous. */
.seal-fx .kr-h {
  transform-box: view-box;
  animation: seal-keyring-swing ${KR.sway}s ease-in-out infinite;
}
${KEYS.map((h) => `.seal-fx .kr-h${h.i} {\n  transform-origin: ${h.px}px ${h.py}px;\n}`).join('\n')}
@keyframes seal-keyring-rock {
  0%, 100% {
    transform: rotate(-2.2deg);
  }
  50% {
    transform: rotate(2.2deg);
  }
}
@keyframes seal-keyring-swing {
  0%, 100% {
    transform: rotate(5deg);
  }
  50% {
    transform: rotate(-5deg);
  }
}
${
  rung.lit
    ? `.${c} {
  filter: drop-shadow(0 0 0.09em var(--seal-tint, #8df0cc))
    drop-shadow(0 0 0.22em var(--seal-tint, #8df0cc));
}`
    : // Few keys, a heavier and slower swing, and NO glow — the glow is what the full bunch is for.
      // Deliberately not dimmed: a drained first rung reads as a broken copy, and nobody wears it.
      // Doubled selectors beat the shared block, which the full rung emits again AFTER these rules.
      `.seal-fx.${c} .kr-all,
.seal-fx.${c} .kr-h {
  animation-duration: ${SWAY_FEW}s;
}`
}
`,
  };
}

export const sealKeyringFew = keyring({
  id: 'seal-keyring-few',
  className: 'seal-fx-keyring-few',
  lit: false,
  channels: 1,
});

export const sealKeyring = keyring({
  id: 'seal-keyring',
  className: 'seal-fx-keyring',
  lit: true,
  channels: 3,
});

/**
 * The colour upgrade — EARNED like the seal itself, never bought. Owning it turns on a #rrggbb
 * picker stored in EquippedCosmetics.sealColors['seal-keyring']. Renders nothing itself.
 */
export const sealKeyringColor: SealModule = {
  id: 'seal-keyring-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'channelsModerated', count: 5 },
  since: '2026-08-16',
  upgrade: true,
  className: '',
  labels: { name: 'shop.sealColorKeyring', desc: 'shop.sealColorDesc' },
};
