import type { CardEffectModule } from '../types';

/**
 * Creepy anime EYES — a neon line-art eye fades in CLOSED at a random spot, snaps open, twitches and
 * stares, then closes and vanishes, to reappear elsewhere. A few at once (three reads far creepier than
 * a swarm — the eye you don't quite catch is the unsettling one). Same lifecycle shape as the
 * butterflies (fade-in → act → fade-out → respawn), but every surface is line-art, so it stays crisp
 * and legible even in a chat pill.
 *
 * HAND-DRAWN, NOT VECTOR. A clean stroke reads as an abstract lens; a real drawn eye WAVERS. The outline
 * is a stroked almond (THICK upper lid / THIN lower lid / lash — the anime signature) run through an SVG
 * turbulence displacement, so the line shakes like a pen stroke. The two lids are drawn to meet slightly
 * OFF at the corners (a crooked join), and the displacement's `seed` varies per eye, so no two outlines
 * are the same wobble; a random horizontal flip doubles that.
 *
 * NO TWO EYES MOVE ALIKE. The iris action and the blink rhythm are each picked at spawn from a set of
 * pre-authored variants (`--look` / `--life`), so neighbouring eyes never run the same dance — the thing
 * that made an early version read as "one animation, three times".
 *
 * Structure — three surfaces, all one colour (`--eye`, default crimson), glowing:
 *  - `.p` unmasked container: the LIFECYCLE (fade + lids via `scaleY` + nervous blinks) and the neon
 *    GLOW (drop-shadow on the unmasked parent — a mask would clip a drop-shadow to the stroke).
 *  - `::before` the OUTLINE: the wobbly stroked almond as a `mask` (picked via `--eye-mask`), painted in
 *    `--eye`, flipped by `--flip`.
 *  - `::after` the IRIS: a ring + pupil dot + hot core from layered radial-gradients (they fade out, no
 *    clip needed), running the picked `--look` under a fast ease-out so the pupil GLIDES between spots
 *    (a quick saccade, not a teleport). A pseudo, so bindRespawn ignores its iterations — no cycleAnimation.
 *
 * `--eye` is wired through everything so honouring the colour upgrade is one flip away, but it is left a
 * fixed crimson for now (not `colorable`). No groundGlow: an eye hovers and stares.
 */

// One hand-drawn eye outline as a mask (white stroke = the painted line), wobbled by a turbulence
// displacement whose `seed` differs per variant. THICK upper lid, THIN lower lid, a short lash, and the
// two lids meeting slightly off at the corners — the shape that reads as a drawn eye, not a lens.
const outline = (seed: number): string =>
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 54'%3E%3Cfilter id='r'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.03' numOctaves='2' seed='${seed}' result='n'/%3E%3CfeDisplacementMap in='SourceGraphic' in2='n' scale='1.6'/%3E%3C/filter%3E%3Cg filter='url(%23r)' fill='none' stroke='%23fff' stroke-linecap='round'%3E%3Cpath d='M3,29 C22,7 78,6 98,24' stroke-width='6'/%3E%3Cpath d='M5,29 C24,47 74,47 95,26' stroke-width='2.9'/%3E%3Cpath d='M98,24 l7,-5 M99,27 l8,-1' stroke-width='2.9'/%3E%3C/g%3E%3C/svg%3E") center/contain no-repeat`;

// Distinct wobbles + a clean fallback (used only if --eye-mask is somehow unset).
const OUTLINES = [outline(2), outline(7), outline(13), outline(21)];
const FALLBACK_OUTLINE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 54'%3E%3Cg fill='none' stroke='%23fff' stroke-linecap='round'%3E%3Cpath d='M3,29 C22,7 78,6 98,24' stroke-width='6'/%3E%3Cpath d='M5,29 C24,47 74,47 95,26' stroke-width='2.6'/%3E%3C/g%3E%3C/svg%3E\") center/contain no-repeat";

// A FILLED almond (slightly inside the outline) — the eye APERTURE. Used as a mask on the iris so the
// eyeball is clipped to within the lids and can never poke outside the eye.
const FILLED_ALMOND =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 54'%3E%3Cpath fill='%23fff' d='M4,28 C22,10 78,10 96,27 C78,45 22,45 4,28 Z'/%3E%3C/svg%3E\") center/contain no-repeat";

const LOOKS = ['cardfx-eye-look-0', 'cardfx-eye-look-1', 'cardfx-eye-look-2', 'cardfx-eye-look-3'];
const LIVES = ['cardfx-eye-life-0', 'cardfx-eye-life-1'];
// A per-session rotation of the variant lists: assigning by (index + rot) guarantees the eyes in one
// swarm get DISTINCT looks/blinks (never "one animation, three times"), while the random rotation means
// every variant still gets used across loads. Browser-only randomness at import is fine (server just
// reads catalog metadata). See particle().
const LOOK_ROT = Math.floor(Math.random() * LOOKS.length);
const LIFE_ROT = Math.floor(Math.random() * LIVES.length);

export const cardEyes: CardEffectModule = {
  id: 'card-eyes',
  type: 'card_effect',
  costDust: 5000,
  since: '2026-07-24',
  className: 'card-fx-eyes',
  // Deliberately few: an eye you half-notice is creepier than a crowd of them.
  counts: { web: 3, overlayCard: 3, overlayChat: 2 },
  // Recolourable via its own upgrade; --eye is wired through every layer.
  colorUpgrade: 'card-eyes-color',
  labels: { name: 'shop.cardEyes', desc: 'shop.cardEyesDesc' },
  particle: (rnd, compact, index, color) => {
    // Only the VARIATION around the base width; the base itself is `--eye-base` in CSS, so a taller
    // container grows real eyes instead of the same specks (see the rule).
    const k = rnd(0.84, 1.14);
    // One full appear → stare → vanish cycle. Each eye desynced by a negative delay.
    const dur = compact ? rnd(4, 5.5) : rnd(4.5, 7);
    return {
      left: `${rnd(12, 88).toFixed(1)}%`,
      top: `${rnd(16, 84).toFixed(1)}%`,
      '--eye-k': k.toFixed(3),
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
      // The chosen colour paints every layer (outline, iris, glow); default crimson when unset.
      '--eye': color ?? '#ff3355',
      // Wobble + handedness are a free roll (a shared wobble reads fine). Movement + blink are assigned
      // by index (see LOOK_ROT) so the eyes in one swarm are GUARANTEED distinct, never all-alike.
      '--eye-mask': OUTLINES[Math.floor(rnd(0, OUTLINES.length - 0.0001))]!,
      '--flip': rnd(0, 1) < 0.5 ? '-1' : '1',
      '--look': LOOKS[(index + LOOK_ROT) % LOOKS.length]!,
      '--life': LIVES[(index + LIFE_ROT) % LIVES.length]!,
    };
  },
  // Reborn at a fresh spot / size / outline at opacity 0 (see the life keyframe). The movement variants
  // (--look/--life) are NOT re-rolled: they name the RUNNING animations, and swapping a name mid-flight
  // would restart the timeline; they're fixed per eye at spawn, which already varies eye-to-eye.
  respawnKeys: ['top', '--eye-k', '--eye-mask', '--flip'],
  css: `
/* SIZE FOLLOWS THE CONTAINER on the short surfaces. A chat bubble is 1 line tall or 5, and a constant
   px width meant the same 30px eye in both — barely a smudge under three lines of text. The cqh is
   read on .p (a declaration ON the container would query its PARENT container, not itself). The px
   term is a floor for a one-line pill, the clamp a ceiling so a tall bubble grows no giant eye. */
.card-fx-eyes {
  container-type: size;
}
.card-fx-eyes.compact .p {
  --eye-base: clamp(40px, calc(14px + 78cqh), 96px);
}
/* THE EYE — .p container (lifecycle + glow), ::before outline, ::after iris. Centred on the anchor via
   the negative margins; transform-origin center so the lids close toward the midline. */
.card-fx-eyes .p {
  top: 0;
  --eye-base: 46px;
  --w: calc(var(--eye-base) * var(--eye-k, 1));
  width: var(--w, 44px);
  height: calc(var(--w, 44px) * 0.54);
  margin: calc(var(--w, 44px) * -0.27) 0 0 calc(var(--w, 44px) / -2);
  transform-origin: center;
  animation-name: var(--life, cardfx-eye-life-0);
  animation-duration: var(--dur, 5.5s);
  animation-timing-function: ease-in-out;
  animation-delay: var(--delay, 0s);
  animation-iteration-count: infinite;
  /* Neon glow — on the unmasked parent, so the mask on ::before can't clip it away. */
  filter: drop-shadow(0 0 3px var(--eye, #ff3355)) drop-shadow(0 0 8px var(--eye, #ff3355));
}
/* The IRIS — a ring + pupil dot + hot core, CLIPPED to the eye aperture (the filled-almond mask), so
   the eyeball can never poke past the lids. It looks around by moving its background-POSITION while the
   mask stays put — the clip is fixed to the eye, the eyeball darts inside it. (Moving the element with a
   transform instead would drag the clip along and defeat the point.) */
.card-fx-eyes .p::before {
  content: '';
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  background-size: calc(var(--w, 44px) * 0.44) calc(var(--w, 44px) * 0.44);
  background-position: 50% 50%;
  background-image:
    radial-gradient(circle at 38% 34%, #fff 0 6%, transparent 9%),
    radial-gradient(
      circle,
      var(--eye, #ff3355) 0 20%,
      transparent 24% 44%,
      var(--eye, #ff3355) 48% 58%,
      transparent 62%
    );
  -webkit-mask: ${FILLED_ALMOND};
  mask: ${FILLED_ALMOND};
  animation-name: var(--look, cardfx-eye-look-0);
  animation-duration: var(--dur, 5.5s);
  /* ease-out (not steps): the eyeball GLIDES between spots — fast off the mark, easing into each stop,
     like a real saccade — instead of teleporting a frame at a time. */
  animation-timing-function: ease-out;
  animation-delay: var(--delay, 0s);
  animation-iteration-count: infinite;
}
/* The LIDS / outline — the wobbly stroke painted in --eye, ON TOP of the iris (::after paints last), so
   the eyeball tucks under the lids. Flipped by --flip for handedness. */
.card-fx-eyes .p::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--eye, #ff3355);
  -webkit-mask: var(--eye-mask, ${FALLBACK_OUTLINE});
  mask: var(--eye-mask, ${FALLBACK_OUTLINE});
  transform: scaleX(var(--flip, 1));
}

/* LIFECYCLE variants — fade in closed, snap open, blink(s), close, fade out. scaleY IS the lids. */
@keyframes cardfx-eye-life-0 {
  0% { opacity: 0; transform: scaleY(0.06); }
  7% { opacity: 1; transform: scaleY(0.06); }
  15% { transform: scaleY(1); }
  41% { transform: scaleY(1); }
  44% { transform: scaleY(0.12); }
  47% { transform: scaleY(1); }
  66% { transform: scaleY(1); }
  69% { transform: scaleY(0.12); }
  72% { transform: scaleY(1); }
  87% { opacity: 1; transform: scaleY(1); }
  94% { transform: scaleY(0.06); }
  100% { opacity: 0; transform: scaleY(0.06); }
}
/* One slow blink, opens a touch sooner, stares longer. */
@keyframes cardfx-eye-life-1 {
  0% { opacity: 0; transform: scaleY(0.06); }
  6% { opacity: 1; transform: scaleY(0.06); }
  14% { transform: scaleY(1); }
  54% { transform: scaleY(1); }
  58% { transform: scaleY(0.1); }
  62% { transform: scaleY(1); }
  88% { opacity: 1; transform: scaleY(1); }
  95% { transform: scaleY(0.06); }
  100% { opacity: 0; transform: scaleY(0.06); }
}

/* LOOK variants — the eyeball darts by background-position (50% 50% = centred), glided by ease-out into
   saccades. The filled-almond mask clips it, so a glance to the edge tucks under the lid. */
/* 0 — nervous jitter + two wide glances. */
@keyframes cardfx-eye-look-0 {
  0%, 16% { background-position: 50% 50%; }
  20% { background-position: 62% 40%; }
  24% { background-position: 40% 60%; }
  28% { background-position: 60% 62%; }
  32% { background-position: 38% 42%; }
  36% { background-position: 50% 50%; }
  52% { background-position: 84% 50%; }
  57% { background-position: 16% 50%; }
  61% { background-position: 50% 50%; }
  76% { background-position: 60% 58%; }
  80% { background-position: 40% 44%; }
  84% { background-position: 50% 50%; }
  100% { background-position: 50% 50%; }
}
/* 1 — a wide-eyed sweep around the room. */
@keyframes cardfx-eye-look-1 {
  0%, 15% { background-position: 50% 50%; }
  22% { background-position: 20% 24%; }
  30% { background-position: 80% 24%; }
  38% { background-position: 50% 50%; }
  46% { background-position: 80% 78%; }
  54% { background-position: 20% 78%; }
  62% { background-position: 50% 50%; }
  72% { background-position: 88% 50%; }
  80% { background-position: 12% 50%; }
  86% { background-position: 50% 50%; }
  100% { background-position: 50% 50%; }
}
/* 2 — still, then SNAPS to a corner and locks (a long stare), then back. */
@keyframes cardfx-eye-look-2 {
  0%, 45% { background-position: 50% 50%; }
  49% { background-position: 86% 30%; }
  74% { background-position: 86% 30%; }
  79% { background-position: 50% 50%; }
  100% { background-position: 50% 50%; }
}
/* 3 — a fine tremor throughout, broken by one dart. */
@keyframes cardfx-eye-look-3 {
  0%, 15% { background-position: 50% 50%; }
  19% { background-position: 56% 44%; }
  22% { background-position: 44% 56%; }
  25% { background-position: 56% 52%; }
  28% { background-position: 44% 44%; }
  31% { background-position: 56% 46%; }
  34% { background-position: 46% 56%; }
  40% { background-position: 50% 50%; }
  54% { background-position: 84% 50%; }
  59% { background-position: 18% 60%; }
  64% { background-position: 50% 50%; }
  72% { background-position: 55% 55%; }
  75% { background-position: 44% 45%; }
  78% { background-position: 56% 45%; }
  82% { background-position: 50% 50%; }
  100% { background-position: 50% 50%; }
}
`,
};
