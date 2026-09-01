/**
 * Stylesheet for the flood bench (see ../FloodBench.tsx). Injected on its own tag rather than added
 * to the cosmetics registry: none of this is a catalogue item yet, and registering one would put it
 * in the shop at a price nobody has agreed to.
 *
 * WHAT MAKES A FLOOD READ AS THE ELEMENT AND NOT AS A COLOURED BOX: every layer here gets its shape
 * from a MASK, not from a gradient. A flame is a silhouette with a pointed tip, a wave is a curve —
 * both are cut out of a flat fill by a tiny inline SVG, so the edge stays hard at any size and the
 * paint inside can stay simple. Soft paint is only ever the halo AROUND those shapes. A gradient
 * that fades in every direction has no edge for the eye to catch and reads as a smudge; that is the
 * whole difference between this and the first pass.
 *
 * Everything is a ONE-SHOT: the animations live under `.is-on`, which the bench adds for the length
 * of the event and removes afterwards. That mirrors what production would do (roll the dice when the
 * card mounts, add the class, drop it when it finishes) and it is why nothing here loops forever.
 */

const SVG = "xmlns='http://www.w3.org/2000/svg'";

/** Flame silhouette, tip up, stretched to whatever box it masks. `flip` mirrors it so one path can
 *  furnish a row without the repetition being readable. */
const FLAME = (d: string, flip = false) =>
  `url("data:image/svg+xml,%3Csvg ${SVG} viewBox='0 0 100 300' preserveAspectRatio='none'%3E%3Cpath ${
    flip ? "transform='translate(100,0) scale(-1,1)' " : ''
  }d='${d}' fill='%23fff'/%3E%3C/svg%3E")`;

/**
 * The silhouettes. Drawn 1:3, the proportion a tongue actually gets, so `preserveAspectRatio='none'`
 * has almost nothing to stretch. Each is the same three moves — a waist above the base, a small lick
 * splitting off one side, a tip that ends in a CORNER rather than a curve — which is what separates a
 * flame from the lightbulb shape a rounded teardrop gives you.
 */
const FLAME_A =
  'M50 300 C 10 270 6 210 32 168 C 46 146 50 120 40 92 C 52 104 62 118 64 136 C 72 110 74 84 66 56 C 78 92 92 140 88 190 C 86 236 74 278 50 300 Z';
const FLAME_B =
  'M50 300 C 18 274 14 218 34 176 C 48 146 52 112 44 78 C 58 96 68 126 68 152 C 78 122 80 92 74 62 C 86 104 92 156 84 200 C 78 246 68 280 50 300 Z';
/** Stubbier, with the lick low down — the one that fills a gap between two tall neighbours. */
const FLAME_C =
  'M50 300 C 14 280 10 232 30 198 C 42 178 44 156 36 134 C 56 150 68 174 68 200 C 76 178 78 156 74 136 C 92 174 90 246 60 292 C 56 296 53 298 50 300 Z';

/** Water wave tile: one full period, filled below the curve. */
const WAVE_FILL = (color: string) =>
  `url("data:image/svg+xml,%3Csvg ${SVG} width='240' height='26' viewBox='0 0 240 26' preserveAspectRatio='none'%3E%3Cpath d='M0 13 q30 -12 60 0 t60 0 t60 0 t60 0 V26 H0 Z' fill='%23${color}'/%3E%3C/svg%3E")`;

/** The same curve as a STROKE — the lit waterline. Its own tile, so it can ride a different speed
 *  than the body it belongs to, which is what sells the surface as moving water. */
const WAVE_LINE = (color: string) =>
  `url("data:image/svg+xml,%3Csvg ${SVG} width='240' height='26' viewBox='0 0 240 26' preserveAspectRatio='none'%3E%3Cpath d='M0 13 q30 -12 60 0 t60 0 t60 0 t60 0' fill='none' stroke='%23${color}' stroke-width='2'/%3E%3C/svg%3E")`;

/**
 * A wall of water seen side-on: flat back, a wavy leading edge, and the FOAM LINE stroked along that
 * edge inside the same SVG. Drawn as an image rather than cut out as a mask because the edge is the
 * whole point — a masked shape has no line on its boundary, and without one a crossing wave is only
 * a lit rectangle sliding past. `non-scaling-stroke` keeps that line hairline-thin however far the
 * box stretches the drawing.
 */
const WALL_EDGE = 'M62 0 C 72 14 58 28 70 44 C 82 60 62 74 72 88 C 78 96 70 100 62 100';
const WALL_ART = `url("data:image/svg+xml,%3Csvg ${SVG} viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='w' x1='0' y1='0' x2='1' y2='0'%3E%3Cstop offset='0' stop-color='%231e8abe' stop-opacity='0'/%3E%3Cstop offset='0.62' stop-color='%2360cef4' stop-opacity='0.5'/%3E%3Cstop offset='1' stop-color='%23dff8ff' stop-opacity='0.92'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M0 0 H62 ${WALL_EDGE.slice(
  6,
)} H0 Z' fill='url(%23w)'/%3E%3Cpath d='${WALL_EDGE}' fill='none' stroke='%23f2fdff' stroke-opacity='0.95' stroke-width='2' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E")`;

export const FLOOD_CSS = `
.flood-fx {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: none;
}
.flood-fx > * {
  position: absolute;
}
/* The light the flood throws back INTO the card. In production this is the flood layer's own
   ::before — the card's two pseudos are already spoken for by the frame's ring and edge glow. */
.flood-fx .rim {
  inset: 0;
  border-radius: inherit;
  opacity: 0;
}

/* ============================================================ FORGE — the card catches fire.
   Tongues hinged on the bottom edge, each CUT OUT of a flat fire gradient by a flame mask, each on
   its own clock. The wash behind them is only the heat they throw; on its own it would be exactly
   the smudge this bench exists to avoid. */
.f-forge .bed {
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  background: linear-gradient(90deg, transparent, #ff8c1a 12%, #ffd79a 50%, #ff8c1a 88%, transparent);
  box-shadow: 0 0 12px 2px rgba(255, 122, 20, 0.75);
  transform: scaleX(0);
  transform-origin: 50% 100%;
}
.f-forge .wash {
  left: 0;
  right: 0;
  bottom: 0;
  height: 0;
  background: linear-gradient(to top,
    rgba(255, 92, 8, 0.3),
    rgba(196, 42, 4, 0.13) 46%,
    rgba(160, 30, 2, 0.03) 74%,
    transparent);
}
/* The tongue: the mask owns the SHAPE, the gradient owns the HEAT. Hottest at the base and cooling
   toward the tip — a flame is white where the fuel is and red where it is running out. */
.f-forge .tongue {
  bottom: -2px;
  left: var(--x);
  width: var(--w);
  height: var(--h);
  margin-left: calc(var(--w) / -2);
  transform-origin: 50% 100%;
  background: linear-gradient(to top,
    #fff1cd 0 5%,
    #ffcf6a 16%,
    #ff9a24 38%,
    #f4570c 60%,
    rgba(198, 44, 3, 0.9) 80%,
    rgba(150, 24, 2, 0.55) 100%);
  -webkit-mask-image: var(--fm);
  mask-image: var(--fm);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  scale: 1 0;
  opacity: 0;
}
/* The core: the same silhouette, narrower and shorter, white-hot. Two nested shapes is what gives a
   flame depth — a single fill, however well shaped, stays a paper cut-out. */
.f-forge .tongue::before {
  content: '';
  position: absolute;
  left: 20%;
  right: 20%;
  bottom: 0;
  height: 58%;
  background: linear-gradient(to top, #fffdf4 0 12%, #ffe9a6 46%, rgba(255, 196, 92, 0) 100%);
  -webkit-mask-image: var(--fm);
  mask-image: var(--fm);
  -webkit-mask-size: 100% 100%;
  mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
}
/* THE BACK ROW. Same silhouettes, deeper in the fire: no white core and a red-shifted gradient, so
   they read as flames standing BEHIND the front ones rather than as dimmer copies. Depth by colour
   and not by opacity — a half-transparent flame shows the card through itself and stops being fire. */
.f-forge .tongue.back {
  background: linear-gradient(to top,
    #ff9d33 0 8%,
    #f46c10 30%,
    #c93b05 56%,
    rgba(158, 26, 2, 0.85) 78%,
    rgba(110, 14, 1, 0.5) 100%);
}
.f-forge .tongue.back::before {
  display: none;
}
/* A spark thrown off a tip. Small, SOLID and haloed — an ember that is itself a soft gradient is
   invisible over a bright stream (the same lesson frame-embers learned on the border). */
.f-forge .ember {
  bottom: var(--from);
  left: var(--x);
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  background: #ffe0a8;
  box-shadow: 0 0 6px 1px rgba(255, 140, 40, 0.9);
  opacity: 0;
}
.f-forge .rim {
  box-shadow: inset 0 -26px 34px -20px rgba(255, 128, 24, 0.9), inset 0 0 18px -6px rgba(255, 90, 10, 0.45);
}
.f-forge.is-on .bed { animation: fl-bed var(--fd) ease-out both; }
.f-forge.is-on .wash { animation: fl-wash var(--fd) ease-in-out both; }
.f-forge.is-on .tongue {
  animation:
    fl-tongue var(--fd) ease-out var(--dl) both,
    fl-lick var(--lick) ease-in-out var(--dl) infinite;
}
.f-forge.is-on .ember { animation: fl-ember var(--edur) ease-out var(--dl) infinite both; }
.f-forge.is-on .rim { animation: fl-rim var(--fd) ease-in-out both; }
@keyframes fl-bed {
  0% { transform: scaleX(0); opacity: 0; }
  7% { transform: scaleX(1); opacity: 1; }
  76% { opacity: 1; }
  100% { transform: scaleX(0.86); opacity: 0; }
}
@keyframes fl-wash {
  0% { height: 0; opacity: 0; }
  10% { opacity: 1; }
  34% { height: 82%; }
  62% { height: 88%; opacity: 1; }
  86% { height: 22%; opacity: 0.5; }
  100% { height: 0; opacity: 0; }
}
/* Climb, hold with a breath, then burn down and go out. The tip dies BEFORE the base (scale y to 0
   with the origin at the bottom) — fire retreats to its fuel, it does not fade uniformly. */
@keyframes fl-tongue {
  0% { scale: 1 0; opacity: 0; }
  6% { opacity: 1; }
  22% { scale: 1.04 1.06; }
  30% { scale: 0.96 0.88; }
  46% { scale: 1 1.02; }
  64% { scale: 0.97 0.92; opacity: 1; }
  84% { scale: 0.85 0.4; opacity: 0.9; }
  100% { scale: 0.68 0; opacity: 0; }
}
/* The lean. Only rotate and filter — scale belongs to the climb, and one property cannot carry two
   animations (the catalogue has learned this three times over). */
@keyframes fl-lick {
  0%, 100% { rotate: -5deg; filter: brightness(0.95); }
  35% { rotate: 4deg; filter: brightness(1.22); }
  70% { rotate: -2deg; filter: brightness(1.05); }
}
@keyframes fl-ember {
  0% { transform: translate(0, 0); opacity: 0; }
  12% { opacity: 1; }
  70% { opacity: 0.85; }
  100% { transform: translate(var(--drift), calc(var(--rise) * -1)); opacity: 0; }
}
@keyframes fl-rim {
  0%, 4% { opacity: 0; }
  30% { opacity: 1; }
  66% { opacity: 0.9; }
  100% { opacity: 0; }
}

/* ============================================================ LAVA — the card fills with melt.
   The opposite reading of the same slot: not flames but a heavy level that RISES, crusted on top and
   cracking. Kept translucent on purpose — the card's own content has to survive underneath it, and
   an opaque block would simply delete the message for three seconds. */
.f-lava .body {
  left: 0;
  right: 0;
  bottom: 0;
  height: 0;
  background: linear-gradient(to top,
    rgba(58, 8, 2, 0.72),
    rgba(112, 18, 3, 0.56) 44%,
    rgba(168, 34, 5, 0.44) 80%,
    rgba(206, 56, 8, 0.4));
}
/* Cracks in the cooling skin: two vein systems at different angles and periods, so the pattern never
   resolves into stripes, fading out toward the bottom where the melt is deep. */
.f-lava .body::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(104deg,
      transparent 0 23px, rgba(255, 152, 40, 0.34) 23px 24px, transparent 24px 57px),
    repeating-linear-gradient(67deg,
      transparent 0 37px, rgba(255, 116, 16, 0.22) 37px 38px, transparent 38px 79px);
  -webkit-mask: linear-gradient(to top, transparent, #000 46%, #000 82%, transparent);
  mask: linear-gradient(to top, transparent, #000 46%, #000 82%, transparent);
  animation: fl-veins 11s linear infinite;
}
/* Heat trapped right under the skin. */
.f-lava .body::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, transparent 62%, rgba(255, 122, 22, 0.3));
}
/* The melt line: a 1px white-hot edge over a short glow, wobbling instead of sitting flat. */
.f-lava .crust {
  left: -6%;
  right: -6%;
  bottom: 0;
  height: 16px;
  background:
    linear-gradient(to bottom,
      transparent 0 6px, #ffdca0 6px 7px, #ff8f28 7px 9px, rgba(255, 106, 12, 0.32) 9px 12px, transparent 12px),
    radial-gradient(62% 100% at 50% 100%, rgba(255, 150, 40, 0.3), transparent 78%);
  /* Uneven along the width: a crust that is equally bright end to end reads as a neon tube. */
  -webkit-mask: linear-gradient(90deg, rgba(0,0,0,0.45), #000 18%, rgba(0,0,0,0.6) 42%, #000 68%, rgba(0,0,0,0.5));
  mask: linear-gradient(90deg, rgba(0,0,0,0.45), #000 18%, rgba(0,0,0,0.6) 42%, #000 68%, rgba(0,0,0,0.5));
  opacity: 0;
}
.f-lava .blorp {
  left: var(--x);
  bottom: var(--from);
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  background: radial-gradient(circle at 40% 34%, #ffcf80, #ff7a18 62%, rgba(160, 24, 2, 0) 100%);
  opacity: 0;
}
.f-lava .rim {
  box-shadow: inset 0 -22px 30px -18px rgba(255, 110, 20, 0.8);
}
.f-lava.is-on .body { animation: fl-fill var(--fd) cubic-bezier(0.3, 0.9, 0.4, 1) both; }
.f-lava.is-on .crust {
  animation:
    fl-ride var(--fd) cubic-bezier(0.3, 0.9, 0.4, 1) both,
    fl-line-in var(--fd) linear both,
    fl-crust-wob 2.6s ease-in-out infinite;
}
.f-lava.is-on .blorp { animation: fl-blorp var(--edur) ease-in-out var(--dl) infinite both; }
.f-lava.is-on .rim { animation: fl-rim var(--fd) ease-in-out both; }
@keyframes fl-veins {
  0% { transform: translateX(0); }
  100% { transform: translateX(-57px); }
}
/* Poured, not raised: fast in, a small overshoot as it settles, a long hold, then it drains away
   under itself. The overshoot is the entire reason this reads as a liquid with weight. */
@keyframes fl-fill {
  0% { height: 0; }
  30% { height: 76%; }
  38% { height: 68%; }
  46% { height: 72%; }
  72% { height: 72%; }
  100% { height: 0; }
}
/* What rides ON the level: same numbers as fl-fill, minus half the rider's own height so it straddles
   the surface instead of standing on it. Its own property (bottom), so it stacks with the scroll and
   the slosh without any of the three deleting the others. */
@keyframes fl-ride {
  0% { bottom: calc(0% - var(--rh, 8px)); }
  30% { bottom: calc(76% - var(--rh, 8px)); }
  38% { bottom: calc(68% - var(--rh, 8px)); }
  46% { bottom: calc(72% - var(--rh, 8px)); }
  72% { bottom: calc(72% - var(--rh, 8px)); }
  100% { bottom: calc(0% - var(--rh, 8px)); }
}
@keyframes fl-line-in {
  0% { opacity: 0; }
  8%, 72% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes fl-crust-wob {
  0%, 100% { transform: translateX(-6px) scaleY(1); }
  50% { transform: translateX(6px) scaleY(1.2); }
}
@keyframes fl-blorp {
  0% { transform: translateY(0) scale(0.4); opacity: 0; }
  20% { opacity: 0.95; }
  70% { transform: translateY(calc(var(--rise) * -1)) scale(1); opacity: 0.9; }
  100% { transform: translateY(calc(var(--rise) * -1.15)) scale(0.2); opacity: 0; }
}

/* ============================================================ TIDE — the card fills with water.
   Two wave tiles riding the level in OPPOSITE directions at different speeds, a lit crest on a third,
   caustics inside the body, bubbles, and a gloss left on the glass after it drains. */
.f-tide .body {
  left: 0;
  right: 0;
  bottom: 0;
  height: 0;
  background: linear-gradient(to top,
    rgba(8, 58, 90, 0.56),
    rgba(26, 124, 168, 0.4) 46%,
    rgba(86, 196, 234, 0.34) 82%,
    rgba(168, 236, 255, 0.42));
}
/* Caustics: bands of light bent by the surface, brightest just under it. Thin and slow — water light
   moves lazily, and anything faster reads as a scanline. */
.f-tide .body::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(76deg,
      transparent 0 26px, rgba(200, 246, 255, 0.24) 26px 28px, transparent 28px 62px),
    repeating-linear-gradient(102deg,
      transparent 0 41px, rgba(224, 252, 255, 0.15) 41px 42px, transparent 42px 88px);
  -webkit-mask: linear-gradient(to top, transparent, rgba(0, 0, 0, 0.5) 40%, #000);
  mask: linear-gradient(to top, transparent, rgba(0, 0, 0, 0.5) 40%, #000);
  animation: fl-caustics 13s linear infinite;
}
.f-tide .wave {
  left: 0;
  width: 200%;
  height: var(--wv);
  --rh: calc(var(--wv) * 0.5);
  bottom: calc(var(--rh) * -1);
  background-repeat: repeat-x;
  background-size: 50% 100%;
}
.f-tide .w-back {
  bottom: calc(var(--rh) * -1 + 3px);
  background-image: ${WAVE_FILL('0e5c85')};
  opacity: 0.8;
}
.f-tide .w-front {
  background-image: ${WAVE_FILL('3fb4e2')};
  opacity: 0.9;
}
.f-tide .w-line {
  background-image: ${WAVE_LINE('e2f8ff')};
}
.f-tide .bubble {
  left: var(--x);
  bottom: var(--from);
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  border: 1px solid rgba(230, 251, 255, 0.9);
  background: radial-gradient(circle at 34% 30%, rgba(255, 255, 255, 0.95), rgba(180, 235, 255, 0.2) 60%, transparent 74%);
  opacity: 0;
}
/* What is left on the glass for a moment after the water goes. Cheap, and it is what stops the drain
   from reading as "the effect was switched off". */
.f-tide .gloss {
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(to top, rgba(190, 240, 255, 0.16), transparent 46%);
  opacity: 0;
}
.f-tide .rim {
  box-shadow: inset 0 -20px 28px -18px rgba(150, 232, 255, 0.85);
}
.f-tide.is-on .body { animation: fl-fill var(--fd) cubic-bezier(0.3, 0.9, 0.4, 1) both; }
.f-tide.is-on .w-back {
  animation:
    fl-ride var(--fd) cubic-bezier(0.3, 0.9, 0.4, 1) both,
    fl-scroll-b 4.4s linear infinite,
    fl-slosh 2.9s ease-in-out infinite;
}
.f-tide.is-on .w-front {
  animation:
    fl-ride var(--fd) cubic-bezier(0.3, 0.9, 0.4, 1) both,
    fl-scroll-f 3.1s linear infinite,
    fl-slosh-alt 2.9s ease-in-out infinite;
}
.f-tide.is-on .w-line {
  animation:
    fl-ride var(--fd) cubic-bezier(0.3, 0.9, 0.4, 1) both,
    fl-scroll-f 3.1s linear infinite,
    fl-slosh-alt 2.9s ease-in-out infinite;
}
.f-tide.is-on .bubble { animation: fl-bubble var(--edur) ease-in var(--dl) infinite both; }
.f-tide.is-on .gloss { animation: fl-gloss var(--fd) ease-out both; }
.f-tide.is-on .rim { animation: fl-rim var(--fd) ease-in-out both; }
@keyframes fl-caustics {
  0% { transform: translateX(0); }
  100% { transform: translateX(-62px); }
}
/* One tile is half the element, so -50% lands the pattern exactly where it started: seamless. */
@keyframes fl-scroll-b {
  0% { translate: 0 0; }
  100% { translate: -50% 0; }
}
@keyframes fl-scroll-f {
  0% { translate: -50% 0; }
  100% { translate: 0 0; }
}
@keyframes fl-slosh {
  0%, 100% { transform: translateY(2px) scaleY(0.9); }
  50% { transform: translateY(-3px) scaleY(1.15); }
}
@keyframes fl-slosh-alt {
  0%, 100% { transform: translateY(-3px) scaleY(1.1); }
  50% { transform: translateY(2px) scaleY(0.92); }
}
@keyframes fl-bubble {
  0% { transform: translate(0, 0) scale(0.5); opacity: 0; }
  15% { opacity: 0.9; }
  100% { transform: translate(var(--drift), calc(var(--rise) * -1)) scale(1); opacity: 0; }
}
@keyframes fl-gloss {
  0%, 62% { opacity: 0; }
  76% { opacity: 1; }
  100% { opacity: 0; }
}

/* ============================================================ SURGE — one wave crosses the card.
   The other axis of the slot: nothing FILLS, a wall of water passes through and leaves the glass wet.
   Its leading edge is the same kind of cut-out curve as the tide's surface, stood on end — which is
   what stops it reading as a rectangle of light sliding by. */
.f-surge .crest {
  top: -6%;
  bottom: -6%;
  width: 26%;
  left: 0;
  background-image: ${WALL_ART};
  background-size: 100% 100%;
  background-repeat: no-repeat;
  translate: -110% 0;
}
.f-surge .foam {
  left: var(--x);
  bottom: var(--from);
  width: var(--s);
  height: var(--s);
  border-radius: 50%;
  background: rgba(240, 253, 255, 0.95);
  box-shadow: 0 0 5px 1px rgba(150, 230, 255, 0.7);
  opacity: 0;
}
.f-surge .gloss {
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(100deg, rgba(190, 240, 255, 0.18), transparent 60%);
  opacity: 0;
}
.f-surge .rim {
  box-shadow: inset 0 0 22px -8px rgba(160, 234, 255, 0.8);
}
.f-surge.is-on .crest { animation: fl-cross var(--fd) cubic-bezier(0.42, 0.02, 0.55, 0.98) both; }
.f-surge.is-on .foam { animation: fl-foam var(--edur) ease-out var(--dl) both; }
.f-surge.is-on .gloss { animation: fl-gloss var(--fd) ease-out both; }
.f-surge.is-on .rim { animation: fl-rim var(--fd) ease-in-out both; }
@keyframes fl-cross {
  0% { translate: -110% 0; }
  100% { translate: 300% 0; }
}
@keyframes fl-foam {
  0% { transform: translate(0, 0); opacity: 0; }
  30% { opacity: 1; }
  100% { transform: translate(var(--drift), calc(var(--rise) * -1)); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .flood-fx * {
    animation: none !important;
  }
}
`;

/**
 * The mask a tongue wears, handed to it as --fm (see FLOOD_CONCEPTS). Six variants — three shapes,
 * each way round — walked by INDEX rather than rolled: a roll lands the same silhouette on two
 * neighbours often enough that the row reads as stamped.
 */
export function flameMask(i: number): string {
  const n = ((i % 6) + 6) % 6;
  return FLAME([FLAME_A, FLAME_B, FLAME_C][n % 3] ?? FLAME_A, n >= 3);
}
