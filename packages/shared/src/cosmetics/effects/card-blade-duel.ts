import type { CardEffectModule, Surface } from '../types';

/**
 * A duel: two blades of light circle, lunge, lock, spin away and slam back together, throwing sparks
 * and a flash of light at every contact. No figures are drawn — only the blades (a dark hilt stub and
 * a glowing shaft) and what their contact throws off, so it reads as "a fight is happening" without
 * depicting people or any franchise's likeness.
 *
 * THE MODEL IS A HILT PLUS AN ANGLE, not two endpoints. A sword's motion is mostly ROTATION about the
 * hand: a flourish, a spin, a tumbling recoil are all "the angle keeps turning while the hilt drifts".
 * Storing the two ends instead makes a spin inexpressible — the tip would lerp straight THROUGH the
 * hilt — which is exactly how a duel degenerates into two sticks sliding past each other. Angles are
 * ABSOLUTE and accumulate, so `turns: +1` on a beat is a literal extra revolution.
 *
 * EASING IS THE FIGHT. One easing everywhere is what makes choreography read as machinery:
 * - a strike uses easeIn (t³) — it ACCELERATES into the contact and stops dead. Ease out of a strike
 *   and the blades decelerate as they touch, which is the visual definition of "rubbing".
 * - a recoil uses easeOut — the impulse is spent instantly, then it settles.
 * - travel and flourish use easeInOut; a spin is close to linear because a spun blade doesn't ease.
 * The beat DURATIONS carry the rest: strikes are 100-140ms, recoils ~170ms, the calm guard ~900ms.
 * Fast next to slow is the rhythm; uniform beats are a metronome.
 *
 * CONTACT IS DERIVED, NEVER AUTHORED TWICE. A clash beat declares the contact POINT plus each blade's
 * angle and where along its length it is struck; the hilt is then solved backwards from that. So the
 * blades always meet exactly, at any card aspect, and the sparks always come off the real meeting
 * point — instead of two hand-placed poses that drift apart the moment the geometry changes.
 *
 * THE STAGE. Positions are fractions of a centred STAGE (capped at STAGE_ASPECT) rather than of the
 * card, and blade length is a fraction of the card's HEIGHT. A submission card is up to 6:1, and a
 * duel stretched across that would need near-horizontal blades a card-width apart — the fight is a
 * thing of a certain size that happens in the middle, and the flash and sparks spill past it.
 *
 * MOTION TRAIL: every blade is drawn 3 more times at t-18ms, t-36ms, t-54ms, dimmer each. Free, since
 * the pose is a pure function of time, and it does the whole job — a slow blade has no trail, a spin
 * smears into an arc. This is most of what separates "fast" from "teleporting".
 *
 * FLASH SAFETY: six contacts per loop, but only the three heavy ones (power >= 0.8) wash the whole
 * frame with light; the flurry's quick hits bloom locally at the contact only. That keeps full-field
 * flashes at ~0.7/s — the flurry is three hits in ~320ms and would otherwise strobe. Keep it that way
 * if you retune the beats (see card-lightning's css for the same constraint).
 */

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const BLADE_A = '#5ac8ff';
const BLADE_B = '#ff5252';
/** Widest the stage may get before it stops following the card; see the header. */
const STAGE_ASPECT = 3.4;
/** Blade length as a fraction of the stage's height. */
const BLADE_LEN = 0.72;
/** Dark hilt stub, as a fraction of the blade's length. */
const HILT_FRAC = 0.17;
/**
 * Motion trail: how far back it reaches (TRAIL_SPAN) and how many copies fill that span. DENSITY is
 * the whole point — 3 copies across ~54ms are three separately readable blades, i.e. ghosting, which
 * is exactly what a fast beat looked like. The same span filled with 6 copies blurs into one smear.
 * If a beat still ghosts, add samples; do NOT shorten the span, which just deletes the sense of speed.
 */
const TRAIL_SPAN = 54;
// A sample must land closer together than the blade travels between two REAL 16ms frames, or the eye
// reads the copies individually. At TEMPO the fastest spin moves the blade ~18px per frame, and 5
// across 54ms is a copy every ~11ms, so the copies overlap.
const TRAIL_SAMPLES = 5;

/**
 * THE RIBBON — the arc of light left hanging in the air behind each blade, and the reason the card no
 * longer reads as two sticks in empty space. Not the same thing as the motion trail above: that is a
 * 54ms smear whose only job is to stop a fast blade from stuttering, this is a third of a second of
 * PATH, drawn as a tapering band between the blade's tip and a point partway down it.
 *
 * It costs no state. The pose is a pure function of time, so the arc the blade swept is just the same
 * function sampled backwards — which also means it survives the loop boundary for free.
 *
 * Each segment's brightness is scaled by how FAR the blade moved through it, so a slow guard leaves
 * nothing and a full spin leaves a complete ring. Without that the ribbon becomes a permanent smudge
 * welded to the blade during the quiet passages, which is worse than having no ribbon at all.
 */
const RIBBON_SPAN = 340;
const RIBBON_SAMPLES = 20;
/** Fraction along the blade where the ribbon's inner edge starts (1 = the tip). */
const RIBBON_INNER = 0.42;

/**
 * THE BACKGROUND, which exists because a submission card is up to 6:1 and the duel only ever occupies
 * the middle of it (see STAGE_ASPECT) — the rest was flat black.
 *
 * Both parts are CONSEQUENCES of the blades rather than scenery, and that is the whole design rule
 * here: anything invented to fill the space would be wallpaper competing with the fight, which the
 * catalog's other effects already learned not to do. A blade is a metre of burning light, so
 *  - SPILL: it lights the room. A wide soft wash in each blade's colour, riding along with it, far
 *    bigger than the stage so it reaches the card's far corners. When the blades end up buried in the
 *    walls, the spill is what lights those corners.
 *  - MOTES: the room has air in it. Sparse drifting dust across the FULL card width, which catches a
 *    blade's colour when one passes near. Empty black reads as nothing; lit dust reads as depth.
 *
 * Both stay under the blades in the draw order and at alphas low enough to never pull the eye. The
 * mote drift is tied to loop time with whole numbers of laps, so the cycle stays exactly periodic.
 */
const SPILL_ALPHA = 0.42;
const MOTES = 44;

/**
 * Global tempo multiplier on every beat below (NOT on sparks, blooms or the trails, which are
 * physical and keep their own clock). The choreography is authored at its natural rhythm and then
 * deliberately danced slowly: at 1x the ribbon coils into a spiral because the blade laps its own arc
 * before it has faded. Slow blades against fast crackling sparks is also the contrast that makes the
 * thing read as a duel rather than as an effect.
 */
const TEMPO = 1.9;

type Ease = 'in' | 'out' | 'inOut' | 'linear';

interface BladePose {
  hx: number; // hilt, stage fractions
  hy: number;
  ang: number; // radians, absolute (accumulates through spins)
}
interface Pose {
  a: BladePose;
  b: BladePose;
}

/** A pose authored directly: where the hand is and where the blade points. */
interface FreeTarget {
  hx: number;
  hy: number;
  deg: number;
  turns?: number;
}
/** A pose authored as a MEETING: the contact point plus how each blade arrives at it. `at` is how far
 *  along the blade the contact lands (0 = hilt, 1 = tip); the hilt is solved from it. */
interface MeetTarget {
  cx: number;
  cy: number;
  aDeg: number;
  aAt: number;
  aTurns?: number;
  bDeg: number;
  bAt: number;
  bTurns?: number;
  /** Impact strength: sparks and bloom scale with it; >= 0.8 also washes the frame. 0 = a press. */
  power: number;
}
/**
 * A pose authored as an ANCHOR per blade — the same solve as a meet, but each blade gets its own
 * point instead of the two sharing one. That is what a thrown blade needs: the two of them end up
 * buried in opposite walls, which a meet cannot express.
 */
interface PinSpec {
  /** Where this blade's `at` point lands, in stage fractions. Ignored when `edge` is set. */
  px: number;
  py: number;
  deg: number;
  /** How far along the blade that point is (1 = the tip, i.e. what goes into a wall). */
  at: number;
  turns?: number;
  /**
   * Anchor to the CARD's own left (-1) or right (1) edge rather than to a point on the stage. The
   * stage is narrower than a wide card (see STAGE_ASPECT), so a blade thrown at the stage's edge
   * stops dead in open space a third of the way in — there has to be something there to stick INTO,
   * and the card's border is the only wall this effect has.
   */
  edge?: -1 | 1;
}
/** A fixed spark source for a beat, for sparks that belong somewhere the blades are not. */
interface SparkSource {
  x: number;
  y: number;
  power: number;
  /** Centre of the fan, in degrees; omit for a full 360° burst. */
  spray?: number;
  /** Emit across the whole beat instead of bursting at its end. */
  trickle?: boolean;
  /** Pin to the card's left (-1) or right (1) edge instead of to `x`; see PinSpec.edge. */
  edge?: -1 | 1;
}
interface Beat {
  label: string;
  ms: number;
  ease: Ease;
  free?: { a: FreeTarget; b: FreeTarget };
  meet?: MeetTarget;
  pin?: { a: PinSpec; b: PinSpec };
  /** A held bind: the blades grind instead of holding still, and trickle sparks the whole beat. */
  bind?: boolean;
  /**
   * Sparks that do NOT come from a blade-on-blade contact — the wall does not move, so a blade
   * scraping its way free leaves them where it entered, not at its own travelling tip.
   */
  sparks?: SparkSource[];
}

/**
 * THE LOOP SEAM LIVES HERE: both blades buried point-first in the opposite walls, quivering and
 * shedding sparks. The cycle's last beat arrives at this pose and its first beat leaves from it.
 *
 * A boundary needs position AND velocity to carry across it, and here both are trivially satisfied
 * because both sides are STILL — the blades are stuck in a wall, so there is nothing to match. That
 * is the opposite of the trick the circling drift used (constant velocity through the cut), and it
 * only works because of what the stillness MEANS. An earlier version stopped dead at a neutral guard
 * and read as the animation restarting; a stop is only a tell when the pose it stops in is the
 * default one. A blade shuddering in a wall is a story beat, and the wall keeps throwing sparks the
 * whole time, so the frame is never actually static.
 *
 * THE SIDES ALSO SWAP HERE, and that is the point. A flies right-to-left and buries itself in the
 * LEFT wall, B does the mirror — so when they are pulled free, they come out on each other's side.
 * A drifting circle did the same job before and was correct but slow; a thrown blade does it in a
 * third of the time and is the best moment in the piece.
 */
const STUCK: { a: PinSpec; b: PinSpec } = {
  // `at: 1` pins the very TIP to the wall, leaving the whole blade jutting back into the card.
  a: { px: 0, py: 0.3, deg: 180, at: 1, edge: -1 },
  b: { px: 0, py: 0.62, deg: 0, at: 1, edge: 1 },
};
/** Where the sparks live for the whole embedded sequence: at the WALL, not on the moving blade. */
const WALL_A: Omit<SparkSource, 'power'> = { x: 0, y: 0.3, spray: 0, edge: -1 };
const WALL_B: Omit<SparkSource, 'power'> = { x: 0, y: 0.62, spray: 180, edge: 1 };

/**
 * The fight. Read top to bottom as a shot list.
 *
 * PACING IS THE WHOLE CRAFT HERE, and every beat below is slower than its first draft. A strike is
 * only legible if the blade travels a readable distance per FRAME: at 60fps a 130ms strike is eight
 * frames, so a half-turn across the card moves the blade ~25° and a third of the stage between one
 * frame and the next, and neither the eye nor the motion trail can bridge that — it comes out as
 * separated ghosts rather than an arc. Beats are ~1.5x longer than the version that read as mush.
 *
 * The two blades SWAP SIDES twice, and deliberately in two DIFFERENT ways: violently mid-fight (the
 * spin out of a bind) and by being thrown into the walls at the end (see STUCK). Doing the same spin
 * both times made the second one look like they teleported through each other.
 */
const BEATS: Beat[] = [
  // Second half of the embedded hold — the loop boundary is a few frames back, mid-quiver. See STUCK.
  {
    label: 'stuck (hold)',
    ms: 200,
    ease: 'linear',
    bind: true,
    pin: STUCK,
    sparks: [
      { ...WALL_A, power: 0.18, trickle: true },
      { ...WALL_B, power: 0.18, trickle: true },
    ],
  },
  // Drawn back out of the wall along their own axis — the tip is the last thing to leave, and it
  // scrapes the whole way, which is what the trickle is. `out` easing: a blade comes free with a jerk
  // and then slides.
  {
    label: 'pull free',
    ms: 300,
    ease: 'out',
    bind: true,
    // Plain stage points, NOT `edge`: this is the tip after it has come clear of the wall, so it has
    // to be a real distance inboard rather than pinned to the border it just left.
    pin: {
      a: { px: 0.14, py: 0.3, deg: 180, at: 1 },
      b: { px: 0.86, py: 0.62, deg: 0, at: 1 },
    },
    sparks: [
      { ...WALL_A, power: 0.42, trickle: true },
      { ...WALL_B, power: 0.42, trickle: true },
    ],
  },
  // Up into a guard, each on the side the throw delivered them to.
  {
    label: 'to guard',
    ms: 280,
    ease: 'inOut',
    free: { a: { hx: 0.16, hy: 0.84, deg: -55 }, b: { hx: 0.84, hy: 0.84, deg: -125 } },
  },
  // A cocks the blade back over its shoulder while B drops out of its high guard to meet it — the
  // anticipation is what makes the next 150ms read as force rather than as a slide.
  {
    label: 'windup A',
    ms: 300,
    ease: 'out',
    free: { a: { hx: 0.12, hy: 0.62, deg: -150 }, b: { hx: 0.8, hy: 0.6, deg: -108 } },
  },
  {
    label: 'strike A',
    ms: 150,
    ease: 'in',
    meet: { cx: 0.5, cy: 0.28, aDeg: -25, aAt: 0.82, bDeg: -155, bAt: 0.72, power: 0.9 },
  },
  {
    label: 'recoil',
    ms: 220,
    ease: 'out',
    free: { a: { hx: 0.3, hy: 0.72, deg: -50 }, b: { hx: 0.7, hy: 0.66, deg: -130 } },
  },
  // B answers with a full twirl before committing — a flourish is the cheapest way to say the thing
  // holding the blade is skilled, and it gives the eye a beat of rest between exchanges.
  {
    label: 'flourish B',
    ms: 400,
    ease: 'inOut',
    free: { a: { hx: 0.24, hy: 0.82, deg: -12 }, b: { hx: 0.82, hy: 0.58, deg: -128, turns: 1 } },
  },
  {
    label: 'strike B low',
    ms: 160,
    ease: 'in',
    meet: { cx: 0.42, cy: 0.66, aDeg: -8, aAt: 0.78, bDeg: 128, bAt: 0.8, power: 0.85 },
  },
  {
    label: 'bind',
    ms: 340,
    ease: 'inOut',
    bind: true,
    meet: { cx: 0.45, cy: 0.62, aDeg: -14, aAt: 0.76, bDeg: 122, bAt: 0.78, power: 0.15 },
  },
  // They break the lock by spinning PAST each other and trading sides; opposite directions so the two
  // arcs don't read as one rotating object.
  {
    label: 'break, swap sides',
    // The fastest beat in the fight (a full turn each WHILE crossing the stage), so it sets the
    // per-frame travel the trail has to bridge — shortening it is what tips this into ghosting.
    ms: 520,
    ease: 'inOut',
    free: {
      a: { hx: 0.76, hy: 0.74, deg: -120, turns: 1 },
      b: { hx: 0.22, hy: 0.7, deg: -60, turns: -1 },
    },
  },
  // THE FEINT. A sells a cut to the high line, B buys it and commits its parry up there, and A whips
  // the blade under it into the low line instead.
  //
  // What makes a feint READ is not the attacker — a blade that changes its mind is just a blade
  // wobbling. It is the DEFENDER: B has to visibly commit high and then be caught out of position,
  // and the fake needs its own arrested beat to land in before the real cut leaves. Those two beats
  // (`feint high` accelerating like a real strike, `feint holds` stopping it dead) are the feint; drop
  // either and the whole sequence collapses back into an ordinary combination.
  {
    label: 'feint high',
    ms: 140,
    ease: 'in',
    free: { a: { hx: 0.7, hy: 0.5, deg: -160 }, b: { hx: 0.3, hy: 0.45, deg: -60 } },
  },
  {
    // Arrested — no contact, and that absence IS the point: the eye expects a clash here and doesn't
    // get one, which is exactly the beat B wasted.
    label: 'feint holds',
    ms: 90,
    ease: 'out',
    free: { a: { hx: 0.68, hy: 0.48, deg: -155 }, b: { hx: 0.32, hy: 0.42, deg: -55 } },
  },
  {
    // Under the committed parry. The turn is what sells it: the blade doesn't travel to the low line,
    // it ROLLS there around the wrist while B is still reaching up.
    label: 'whip under',
    ms: 120,
    ease: 'in',
    free: { a: { hx: 0.62, hy: 0.72, deg: 150 }, b: { hx: 0.34, hy: 0.5, deg: -70 } },
  },
  {
    // B parries, but late and at full stretch — the contact lands near the very TIP of its blade
    // (bAt 0.9), which is what a save made too late looks like.
    label: 'real cut low',
    ms: 140,
    ease: 'in',
    meet: { cx: 0.42, cy: 0.74, aDeg: 165, aAt: 0.85, bDeg: 15, bAt: 0.9, power: 0.75 },
  },
  // Two clean exchanges to close the middle, mid then high — after the feint the eye needs plain
  // honest hits again, or the trick has nothing to be a trick against.
  {
    label: 'exchange back',
    ms: 160,
    ease: 'out',
    free: { a: { hx: 0.7, hy: 0.5, deg: -70 }, b: { hx: 0.3, hy: 0.4, deg: 55 } },
  },
  {
    label: 'exchange mid',
    ms: 180,
    ease: 'in',
    meet: { cx: 0.38, cy: 0.52, aDeg: -95, aAt: 0.7, bDeg: 35, bAt: 0.82, power: 0.65 },
  },
  {
    label: 'exchange back 2',
    ms: 150,
    ease: 'out',
    free: { a: { hx: 0.72, hy: 0.66, deg: -55 }, b: { hx: 0.28, hy: 0.58, deg: -125 } },
  },
  {
    label: 'exchange high',
    ms: 180,
    ease: 'in',
    meet: { cx: 0.56, cy: 0.3, aDeg: 145, aAt: 0.8, bDeg: -70, bAt: 0.72, power: 0.7 },
  },
  // THE FINALE. Four beats, because one big hit on its own is not a climax — it is just the loudest
  // moment. They break off and square up (the room goes quiet), rear back to the far edges spinning
  // up (the held breath), collide, and then STAY collided: the slam is followed by a long grinding
  // lock, which is what makes it read as the end of a fight rather than another exchange.
  {
    label: 'disengage',
    ms: 280,
    ease: 'out',
    free: { a: { hx: 0.7, hy: 0.6, deg: -95 }, b: { hx: 0.3, hy: 0.6, deg: -85 } },
  },
  {
    label: 'big windup',
    ms: 380,
    ease: 'out',
    free: {
      a: { hx: 0.88, hy: 0.3, deg: -18, turns: 1 },
      b: { hx: 0.12, hy: 0.3, deg: -162, turns: -1 },
    },
  },
  {
    label: 'slam',
    ms: 170,
    ease: 'in',
    meet: { cx: 0.5, cy: 0.44, aDeg: 160, aAt: 0.85, bDeg: 20, bAt: 0.85, power: 1 },
  },
  // The held lock. Its trickle keeps throwing sparks long after the slam's flash has cleared, which is
  // most of why the ending now has a tail instead of just stopping.
  {
    label: 'lock struggle',
    ms: 420,
    ease: 'inOut',
    bind: true,
    meet: { cx: 0.5, cy: 0.48, aDeg: 152, aAt: 0.82, bDeg: 28, bAt: 0.82, power: 0.4 },
  },
  // THE THROW. They break the lock, cock the blades back, and hurl them at each other — the blades
  // cross in mid-air at different heights and bury themselves in the opposite walls.
  //
  // The heights (A high at 0.30, B low at 0.62) are the load-bearing part: two objects crossing a flat
  // card on the same line would have to pass through one another. Separated, the eye reads one as
  // nearer and the pair as genuinely flying past each other.
  {
    label: 'cock to throw',
    ms: 300,
    ease: 'out',
    free: {
      a: { hx: 0.86, hy: 0.3, deg: -8 },
      b: { hx: 0.14, hy: 0.62, deg: -172 },
    },
  },
  {
    // Ends buried: the pin IS the wall, so the spin has to land point-first, and `turns` is what makes
    // it arrive that way rather than simply sliding across. `in` easing — a thrown blade accelerates
    // off the hand and is stopped by the wall, not by easing out.
    label: 'throw',
    ms: 220,
    ease: 'in',
    pin: {
      a: { ...STUCK.a, turns: 1 },
      b: { ...STUCK.b, turns: -1 },
    },
    sparks: [
      { ...WALL_A, power: 0.7 },
      { ...WALL_B, power: 0.7 },
    ],
  },
  // First half of the embedded hold, running into the loop boundary. Both halves are motionless, so
  // unlike the old circling drift they do NOT have to match durations — there is no velocity to match.
  {
    label: 'stuck (settle)',
    ms: 240,
    ease: 'linear',
    bind: true,
    pin: STUCK,
    sparks: [
      { ...WALL_A, power: 0.3, trickle: true },
      { ...WALL_B, power: 0.3, trickle: true },
    ],
  },
];

/**
 * The beats at their PLAYED durations. Everything downstream (the timeline, the contacts, the still
 * frame) reads this rather than BEATS, so TEMPO can never be applied in one place and forgotten in
 * another — which would silently slide the sparks out of sync with the blades that threw them.
 */
const PLAYED: Beat[] = BEATS.map((b) => ({ ...b, ms: Math.round(b.ms * TEMPO) }));

const LOOP_MS = PLAYED.reduce((n, b) => n + b.ms, 0);

/** Middle of the bind — the one moment of the fight that is legible as a still. DERIVED, not a magic
 *  number: retuning the beats above used to silently move this into the middle of a strike. */
const STILL_MS = (() => {
  let t = 0;
  for (const beat of PLAYED) {
    if (beat.bind) return t + beat.ms / 2;
    t += beat.ms;
  }
  return 0;
})();

function ease(kind: Ease, t: number): number {
  if (kind === 'linear') return t;
  if (kind === 'in') return t * t * t;
  if (kind === 'out') return 1 - Math.pow(1 - t, 3);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
/** The absolute angle nearest `cur` that points the requested way, plus any whole extra turns. A
 *  blade must take the SHORT way round unless a spin was asked for; without this an authored -170°
 *  after a +170° would silently swing the long way. */
function aim(deg: number, cur: number, turns = 0): number {
  const d = ((((deg * DEG - cur + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return cur + d + turns * TAU;
}

interface Key {
  t0: number;
  t1: number;
  ease: Ease;
  from: Pose;
  to: Pose;
  bind: boolean;
}

/**
 * Resolve the beats into interpolatable keyframes. `k` is stageHeight/stageWidth, needed because a
 * hilt solved back from a contact point has to convert the blade's length (measured in stage HEIGHTS)
 * into an x offset (measured in stage WIDTHS) — so the compiled poses depend on the card's aspect and
 * this is redone whenever the layer resizes.
 */
function compile(k: number, over: number): Key[] {
  /** Put the blade's `at` point exactly on (cx, cy) and work the hilt out from there. */
  const anchor = (
    cx: number,
    cy: number,
    deg: number,
    at: number,
    turns: number | undefined,
    curAng: number,
  ): BladePose => {
    const ang = aim(deg, curAng, turns);
    return {
      hx: cx - Math.cos(ang) * BLADE_LEN * k * at,
      hy: cy - Math.sin(ang) * BLADE_LEN * at,
      ang,
    };
  };
  /** A pin's x in stage fractions, resolving `edge` to the card's own border (see PinSpec.edge). */
  const pinX = (p: PinSpec) => (p.edge === undefined ? p.px : p.edge < 0 ? -over : 1 + over);
  const pinned = (p: PinSpec, curAng: number) =>
    anchor(pinX(p), p.py, p.deg, p.at, p.turns, curAng);

  const keys: Key[] = [];
  // The cycle opens buried in the walls — the frame the loop boundary cuts. Solved, not written out,
  // because the hilt of a wall-pinned blade depends on the card's aspect just like a contact does.
  let cur: Pose = {
    a: pinned(STUCK.a, STUCK.a.deg * DEG),
    b: pinned(STUCK.b, STUCK.b.deg * DEG),
  };
  let t = 0;
  for (const beat of PLAYED) {
    let to: Pose;
    if (beat.meet) {
      const m = beat.meet;
      to = {
        a: anchor(m.cx, m.cy, m.aDeg, m.aAt, m.aTurns, cur.a.ang),
        b: anchor(m.cx, m.cy, m.bDeg, m.bAt, m.bTurns, cur.b.ang),
      };
    } else if (beat.pin) {
      to = { a: pinned(beat.pin.a, cur.a.ang), b: pinned(beat.pin.b, cur.b.ang) };
    } else {
      const f = beat.free!;
      to = {
        a: { hx: f.a.hx, hy: f.a.hy, ang: aim(f.a.deg, cur.a.ang, f.a.turns) },
        b: { hx: f.b.hx, hy: f.b.hy, ang: aim(f.b.deg, cur.b.ang, f.b.turns) },
      };
    }
    keys.push({ t0: t, t1: t + beat.ms, ease: beat.ease, from: cur, to, bind: !!beat.bind });
    t += beat.ms;
    cur = to;
  }
  return keys;
}

const compiled = new Map<string, Key[]>();
function keysFor(k: number, over: number): Key[] {
  const kr = Math.round(k * 200) / 200;
  const or = Math.round(over * 200) / 200;
  const id = kr + '|' + or;
  let got = compiled.get(id);
  if (!got) {
    got = compile(kr, or);
    compiled.set(id, got);
  }
  return got;
}

function lerpBlade(p: BladePose, q: BladePose, t: number): BladePose {
  return {
    hx: p.hx + (q.hx - p.hx) * t,
    hy: p.hy + (q.hy - p.hy) * t,
    ang: p.ang + (q.ang - p.ang) * t,
  };
}

function poseAt(keys: Key[], ms: number): Pose {
  const t = ((ms % LOOP_MS) + LOOP_MS) % LOOP_MS;
  for (const key of keys) {
    if (t < key.t0 || t >= key.t1) continue;
    const e = ease(key.ease, (t - key.t0) / (key.t1 - key.t0));
    const pose = { a: lerpBlade(key.from.a, key.to.a, e), b: lerpBlade(key.from.b, key.to.b, e) };
    if (!key.bind) return pose;
    // Locked blades grind rather than freeze; the two get different phases so it reads as two hands
    // pushing, not one shared shake.
    pose.a.ang += Math.sin(t * 0.05) * 0.03;
    pose.b.ang += Math.sin(t * 0.062 + 2.1) * 0.03;
    pose.a.hy += Math.sin(t * 0.043 + 1) * 0.006;
    pose.b.hy += Math.sin(t * 0.051 + 3) * 0.006;
    return pose;
  }
  return keys[keys.length - 1]!.to;
}

interface Spark {
  ang: number;
  speed: number; // stage heights per second
  size: number;
  delay: number; // ms after the contact
  life: number; // ms
}
interface Contact {
  tMs: number;
  cx: number;
  cy: number;
  power: number;
  /** Full-frame light wash, not just a local bloom. Heavy hits only — see the header on flash safety. */
  wash: boolean;
  sparks: Spark[];
  /** Pinned to the card's left (-1) or right (1) border; `cx` is then resolved at paint time. */
  edge?: -1 | 1;
}

/** Deterministic hash (the GLSL sine trick): the shower is rolled once at module load, so a viewer
 *  sees the SAME fight every loop. This effect is choreography, not a swarm — see the header. */
function hash(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * One shower. `trickle` = emitted across the whole beat (a press, or a blade grinding its way out of
 * a wall) rather than burst at one instant; `spray` centres the fan when the sparks come off a
 * surface instead of out of a collision.
 */
function shower(
  power: number,
  trickle: boolean,
  spread: number,
  seed: number,
  spray: number | undefined,
): Spark[] {
  // Count rises with the SQUARE of the power, so a light exchange throws a modest handful while the
  // slam throws a wall. A linear ramp gave the quick exchanges nearly a slam's worth of sparks each,
  // and three overlapping showers is the light soup that made them unreadable.
  const n = trickle ? Math.round(12 + power * 40) : Math.round(8 + power * power * 56);
  const out: Spark[] = [];
  for (let i = 0; i < n; i++) {
    const h = (o: number) => hash(seed + i * 7.13 + o);
    out.push({
      // A wall throws its sparks BACK the way the blade came — a full circle there would send half of
      // them into the wall, where the layer's own clip eats them and the burst reads as half-strength.
      ang: spray === undefined ? h(0) * TAU : (spray + (h(0) - 0.5) * 150) * DEG,
      // A few outrunners at triple speed: a shower where every spark travels the same distance
      // reads as a firework. The spread is what says "metal", not the count.
      speed:
        (trickle ? 0.35 : 0.7) * (1 + power) * (h(1) < 0.18 ? 2.6 + h(2) * 1.6 : 0.5 + h(3) * 1.5),
      size: 0.9 + h(4) * (trickle ? 0.8 : 1.9),
      // SQUARED, so the shower is still a burst at the instant of contact and only its stragglers
      // reach the far end of `spread`. Spreading emission evenly instead turns a heavy hit into a
      // steady fountain, which reads as an effect running rather than as something being struck.
      delay: trickle ? h(5) * spread : h(5) * h(5) * spread,
      // Lifetime tracks the power too: a light hit's sparks have to be GONE before the next contact
      // (~340ms later), or every exchange is watched through the debris of the one before it.
      life: trickle
        ? 200 + h(6) * 180
        : 140 + power * power * 260 + h(6) * (150 + power * power * 430),
    });
  }
  return out;
}

/** Contacts, with their showers, resolved once — none of this depends on the card's aspect. */
const CONTACTS: Contact[] = (() => {
  const out: Contact[] = [];
  let t = 0;
  for (const beat of PLAYED) {
    t += beat.ms;
    const bind = !!beat.bind;
    // A strike's shower is thrown at the moment of contact (the end of the beat); a trickle runs for
    // as long as the beat does, so its sparks are staggered across the whole of it instead.
    const start = t - beat.ms;
    const m = beat.meet;
    if (m) {
      // THE HARDER THE HIT, THE LONGER IT KEEPS THROWING. Emission used to finish within 90ms for
      // every contact, which quietly made the BIGGEST hit look like it had no sparks at all: a heavy
      // contact is also the one with the widest bloom and a full-frame wash, so its entire shower was
      // born and half-spent inside its own flash and emerged already dimming. Stretching emission
      // past the flash (330ms at full power) is what lets the finale actually rain.
      const spread = bind ? beat.ms : 90 + m.power * m.power * 240;
      out.push({
        tMs: bind ? start : t,
        cx: m.cx,
        cy: m.cy,
        power: m.power,
        wash: m.power >= 0.8,
        sparks: shower(m.power, bind, spread, t, undefined),
      });
    }
    // Sources pinned to a place rather than to the blades — the walls. Never washed: a full-frame
    // flash is reserved for blade-on-blade, and there are already three of those in a cycle.
    for (const [i, s] of (beat.sparks ?? []).entries()) {
      const spread = s.trickle ? beat.ms : 90 + s.power * s.power * 240;
      out.push({
        tMs: s.trickle ? start : t,
        cx: s.x,
        cy: s.y,
        power: s.power,
        wash: false,
        sparks: shower(s.power, !!s.trickle, spread, t + 991 * (i + 1), s.spray),
        edge: s.edge,
      });
    }
  }
  return out;
})();

let glowSprite: HTMLCanvasElement | null = null;
let coreSprite: HTMLCanvasElement | null = null;
const spillSprites = new Map<string, HTMLCanvasElement>();

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A very soft, very wide falloff in a blade's colour — the light it throws on the room around it. */
function spillSprite(color: string): HTMLCanvasElement {
  const cached = spillSprites.get(color);
  if (cached) return cached;
  const [r, g, b] = hexToRgb(color);
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  // Falls off early and long. A tight bright core here would read as a second glow competing with
  // the blade's own; what is wanted is only the suggestion that something in the room is lit.
  grad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.26)`);
  grad.addColorStop(0.6, `rgba(${r},${g},${b},0.09)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  spillSprites.set(color, c);
  return c;
}
/** Two stacked sprites per spark — a warm halo and a small white centre — so a spark is incandescent
 *  rather than a coloured dot. Warm gold whichever blade struck: contact sparks are hot metal, not
 *  light, so they must NOT take a blade's colour. (Same pairing as entrance-strike.) */
function ensureSprites(): void {
  if (glowSprite) return;
  const make = (stops: [number, string][]) => {
    const c = document.createElement('canvas');
    c.width = c.height = 48;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
    for (const [at, col] of stops) grad.addColorStop(at, col);
    g.fillStyle = grad;
    g.fillRect(0, 0, 48, 48);
    return c;
  };
  glowSprite = make([
    [0, 'rgba(255,255,255,1)'],
    [0.32, 'rgba(255,216,150,0.85)'],
    [1, 'rgba(255,170,60,0)'],
  ]);
  coreSprite = make([
    [0, 'rgba(255,255,255,1)'],
    [0.5, 'rgba(255,255,255,0.92)'],
    [1, 'rgba(255,240,210,0)'],
  ]);
}

interface Stage {
  ox: number;
  sw: number;
  sh: number;
}
function px(st: Stage, fx: number, fy: number): [number, number] {
  return [st.ox + fx * st.sw, fy * st.sh];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** A point `at` along a blade (0 = hilt, 1 = tip), in canvas pixels. */
function alongBlade(st: Stage, b: BladePose, at: number): [number, number] {
  const len = BLADE_LEN * st.sh;
  const [hx, hy] = px(st, b.hx, b.hy);
  return [hx + Math.cos(b.ang) * len * at, hy + Math.sin(b.ang) * len * at];
}

/** The wash of light a blade throws on the room around it — see the BACKGROUND note. */
function drawSpill(
  ctx: CanvasRenderingContext2D,
  st: Stage,
  b: BladePose,
  color: string,
  wSpill: number,
  hSpill: number,
): void {
  // Centred halfway up the blade rather than on the hilt, so the light comes off the glowing part.
  const [cx, cy] = alongBlade(st, b, 0.55);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = SPILL_ALPHA;
  ctx.drawImage(spillSprite(color), cx - wSpill / 2, cy - hSpill / 2, wSpill, hSpill);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/**
 * Dust in the air across the WHOLE card, brightening and taking a blade's colour as it passes. Drift
 * is a whole number of laps per loop so the cycle stays exactly periodic (see the BACKGROUND note).
 */
function drawMotes(
  ctx: CanvasRenderingContext2D,
  st: Stage,
  bw: number,
  bh: number,
  pose: Pose,
  loopT: number,
  count: number,
): void {
  const [ax, ay] = alongBlade(st, pose.a, 0.55);
  const [bx2, by2] = alongBlade(st, pose.b, 0.55);
  // Light falls off over about a blade's length; past that a mote is just dust.
  const reach = BLADE_LEN * st.sh * 1.5;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < count; i++) {
    const h = (o: number) => hash(i * 13.37 + o);
    // 1 or 2 laps, either direction — whole laps keep the loop seamless.
    const laps = (1 + Math.floor(h(1) * 2)) * (h(2) < 0.5 ? 1 : -1);
    const x = (((h(3) + loopT * laps) % 1) + 1) % 1;
    const bob = Math.sin((loopT * (1 + Math.floor(h(4) * 3)) + h(5)) * TAU) * 0.05;
    const mx = x * bw;
    const my = (h(6) * 0.92 + 0.04 + bob) * bh;
    const dA = Math.hypot(mx - ax, my - ay);
    const dB = Math.hypot(mx - bx2, my - by2);
    const near = Math.min(dA, dB);
    const lit = Math.max(0, 1 - near / reach);
    // Unlit dust is a faint grey speck; a mote near a blade takes its colour and flares. The unlit
    // floor is not decoration — it is the only thing giving the far corners any texture at all while
    // the duel is busy in the middle, so it has to stay perceptible rather than merely present.
    ctx.fillStyle = lit > 0.01 ? (dA < dB ? BLADE_A : BLADE_B) : '#9aa0ab';
    ctx.globalAlpha = 0.12 + lit * lit * 0.48;
    // A mote is DUST, so its apparent size is nearly independent of how big the scene is — clamped to
    // stay at least a pixel across. Scaling it with the card's height (as the blades and sparks do)
    // put it below half a pixel on a 40px leaderboard row, where antialiasing dissolved it entirely
    // and the row looked like it had no background at all.
    const r = (0.75 + h(7) * 0.75) * clamp(st.sh * 0.018, 1, 2.6) * (1 + lit);
    ctx.beginPath();
    ctx.arc(mx, my, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/**
 * The arc of light the blade left behind — see RIBBON_SPAN. Drawn as a strip of quads between the
 * tip's path and the path of a point partway down the blade, oldest and thinnest at the tail.
 *
 * Quads rather than one filled polygon, because each segment needs its OWN alpha: a single path can
 * only take one fill, and a ribbon at uniform opacity looks like a solid painted shape stuck to the
 * card instead of light dissipating. Additive, so where the ribbon crosses itself in a spin it burns
 * brighter — which is what the eye expects from overlapping light.
 */
function drawRibbon(
  ctx: CanvasRenderingContext2D,
  st: Stage,
  keys: Key[],
  ms: number,
  pick: (p: Pose) => BladePose,
  color: string,
  samples: number,
): void {
  const len = BLADE_LEN * st.sh;
  // The reference travel a segment needs for full brightness. Tied to the blade's own length so the
  // threshold means the same thing on a 40px pill and a 192px card.
  const ref = len * 0.16;
  const step = RIBBON_SPAN / samples;
  let prevOut: [number, number] | null = null;
  let prevIn: [number, number] | null = null;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  for (let i = 0; i <= samples; i++) {
    const age = i / samples;
    const pose = pick(poseAt(keys, ms - i * step));
    // The band narrows toward the tail: its inner edge creeps out toward the tip as it ages, so the
    // ribbon comes to a point instead of ending on a blunt cut.
    const inner = RIBBON_INNER + (1 - RIBBON_INNER) * age * 0.55;
    const out = alongBlade(st, pose, 1);
    const inn = alongBlade(st, pose, inner);
    if (prevOut && prevIn) {
      const travel = Math.hypot(out[0] - prevOut[0], out[1] - prevOut[1]);
      // Brightness follows how far the blade actually swept through this segment, so a slow guard
      // leaves no ribbon at all and only a real swing writes on the air.
      const speed = Math.min(1, travel / ref);
      const a = 0.2 * speed * (1 - age) * (1 - age);
      if (a > 0.004) {
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.moveTo(prevOut[0], prevOut[1]);
        ctx.lineTo(out[0], out[1]);
        ctx.lineTo(inn[0], inn[1]);
        ctx.lineTo(prevIn[0], prevIn[1]);
        ctx.closePath();
        ctx.fill();
      }
    }
    prevOut = out;
    prevIn = inn;
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** Halo, then tinted core, then a white centre — three passes of decreasing width, all additive, so
 *  two blades crossing bloom to white at the contact instead of one painting over the other. */
function drawBlade(
  ctx: CanvasRenderingContext2D,
  st: Stage,
  b: BladePose,
  color: string,
  w: number,
  alpha: number,
): void {
  const len = BLADE_LEN * st.sh;
  const [hx, hy] = px(st, b.hx, b.hy);
  const dx = Math.cos(b.ang);
  const dy = Math.sin(b.ang);
  const ex = hx + dx * len * HILT_FRAC;
  const ey = hy + dy * len * HILT_FRAC;
  const tx = hx + dx * len;
  const ty = hy + dy * len;

  ctx.lineCap = 'round';
  if (alpha > 0.7) {
    // The hilt only on the live pose: a trail of hilts is a smear of dark slugs behind the blade.
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#25252b';
    ctx.lineWidth = w * 1.7;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(tx, ty);
  ctx.shadowColor = color;
  // Only the live blade pays for a shadow blur. Six trail copies x two blades x a blurred pass each
  // is the most expensive thing on this canvas, and the trail's job is a smear the live blade's own
  // glow already sits on top of — blurring the copies costs frames and shows nothing.
  ctx.shadowBlur = alpha > 0.7 ? w * 4.5 : 0;
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.5 * alpha;
  ctx.lineWidth = w * 2.5;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.92 * alpha;
  ctx.lineWidth = w * 1.15;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = w * 0.42;
  ctx.stroke();
  // The emitter: a bright bead where the blade leaves the hilt.
  ctx.globalAlpha = 0.85 * alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(ex, ey, w * 0.8, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** ms elapsed since a contact, wrapped into the loop. */
function since(loopMs: number, tMs: number): number {
  const d = loopMs - tMs;
  return d < 0 ? d + LOOP_MS : d;
}

function render(layer: HTMLElement, surface: Surface, compact: boolean): (() => void) | void {
  if (typeof document === 'undefined') return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const cs = canvas.style;
  cs.position = 'absolute';
  cs.inset = '0';
  cs.width = '100%';
  cs.height = '100%';
  cs.pointerEvents = 'none';
  layer.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ensureSprites();

  // The stage alert is the largest surface any of this lands on and the only one watched from across
  // a room, so it carries the fullest shower; a pill gets the fewest.
  const sparkScale = compact ? 0.5 : surface === 'overlayCard' ? 1.15 : 1;
  // A pill is a few px tall, so its blades barely move in absolute terms and half the samples already
  // land on the same pixels — the density that a card needs is wasted work there.
  const trailSamples = compact ? 3 : TRAIL_SAMPLES;
  const ribbonSamples = compact ? 10 : RIBBON_SAMPLES;
  // How much room there is to fill is a question about the CARD, so it is answered in resize() from
  // the real box — never from `compact`. `compact` means SHORT, not small, and the widest, emptiest
  // surface of the lot is a 544x40 leaderboard row: keying the background off that flag switched it
  // off exactly where three quarters of the card had nothing in it.
  let moteCount = 0;
  let spillW = 0;
  let spillH = 0;

  let bw = 0;
  let bh = 0;
  let stage: Stage = { ox: 0, sw: 1, sh: 1 };
  let keys: Key[] = [];
  function resize(): void {
    bw = layer.clientWidth;
    bh = layer.clientHeight;
    if (bw < 2 || bh < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(bw * dpr));
    canvas.height = Math.max(1, Math.floor(bh * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sw = Math.min(bw, bh * STAGE_ASPECT);
    stage = { ox: (bw - sw) / 2, sw, sh: bh };
    // How far the card overhangs the stage on each side, in stage widths — 0 when the stage already
    // fills the card. It is what lets a thrown blade reach the card's own border (see PinSpec.edge).
    keys = keysFor(bh / sw, (bw - sw) / (2 * sw));

    // The share of the card the duel itself never reaches. 0 on a card the stage already fills, ~0.48
    // on a submission card, ~0.75 on a leaderboard row — i.e. exactly how much background is needed.
    const empty = (bw - sw) / bw;
    moteCount = Math.round(MOTES * (0.45 + empty));
    // The light has to carry across the emptiness, so its reach grows with it — but never far past
    // the card, or a small surface ends up uniformly tinted instead of lit from somewhere.
    spillW = Math.min(bh * 7 * (1 + empty * 1.2), bw * 1.15);
    spillH = bh * 3.4;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(layer);

  function paint(ms: number): void {
    if (bw < 2 || bh < 2 || !keys.length) return;
    ctx!.clearRect(0, 0, bw, bh);
    const loopMs = ((ms % LOOP_MS) + LOOP_MS) % LOOP_MS;
    const w = Math.max(1.7, stage.sh * 0.055);

    const livePose = poseAt(keys, ms);

    // The room first: the light the blades throw on it, then the dust hanging in it. Both reach the
    // card's far corners, which the duel itself never does on a wide card — see the BACKGROUND note.
    drawSpill(ctx!, stage, livePose.a, BLADE_A, spillW, spillH);
    drawSpill(ctx!, stage, livePose.b, BLADE_B, spillW, spillH);
    if (moteCount) drawMotes(ctx!, stage, bw, bh, livePose, loopMs / LOOP_MS, moteCount);

    // Ribbons next — they are the air the blades moved through, so the blades sit on top of them.
    drawRibbon(ctx!, stage, keys, ms, (p) => p.a, BLADE_A, ribbonSamples);
    drawRibbon(ctx!, stage, keys, ms, (p) => p.b, BLADE_B, ribbonSamples);

    // Then the motion trail, oldest and faintest at the back. The samples fill a FIXED span of time,
    // so adding samples makes the smear denser without making it longer (see TRAIL_SPAN).
    const step = TRAIL_SPAN / trailSamples;
    for (let i = trailSamples; i >= 1; i--) {
      const p = poseAt(keys, ms - i * step);
      // Falls off with the sample's age, not its index, so the ramp is the same shape whatever the
      // sample count — otherwise raising the density would also quietly brighten the whole trail.
      const age = i / trailSamples;
      const a = 0.26 * (1 - age) * (1 - age) + 0.03;
      drawBlade(ctx!, stage, p.a, BLADE_A, w * (1 - age * 0.45), a);
      drawBlade(ctx!, stage, p.b, BLADE_B, w * (1 - age * 0.45), a);
    }
    const pose = poseAt(keys, ms);
    drawBlade(ctx!, stage, pose.a, BLADE_A, w, 1);
    drawBlade(ctx!, stage, pose.b, BLADE_B, w, 1);

    ctx!.globalCompositeOperation = 'lighter';
    for (const c of CONTACTS) {
      const dt = since(loopMs, c.tMs);
      // An edge-pinned source sits on the CARD's border, which is outside the stage on a wide card.
      const [sx, cy] = px(stage, c.cx, c.cy);
      const cx = c.edge === undefined ? sx : c.edge < 0 ? 0 : bw;

      // The frame itself is lit by the heavy hits — this is what makes an impact felt rather than
      // watched. Short (110ms) and additive, so it brightens the card instead of veiling it.
      if (c.wash && dt < 110) {
        ctx!.globalAlpha = c.power * 0.15 * (1 - dt / 110);
        ctx!.fillStyle = '#ffffff';
        ctx!.fillRect(0, 0, bw, bh);
      }
      // Two blooms at the contact: a hard white one that is gone in a blink, and a wide slow one that
      // is the light still hanging in the air after it.
      //
      // Both radii are kept UNDER ~1.4 stage heights, and that ceiling is the whole tuning story: a
      // bloom generous enough to look right on a tall card turns a 80px-high submission row into one
      // soft ball of fog with the duel lost inside it. The flash has to punctuate the fight, not
      // replace it — if you raise these, check the short card, not the tall one.
      if (dt < 90) {
        const g = 1 - dt / 90;
        const r = stage.sh * (0.22 + c.power * 0.4) * (0.35 + (1 - g) * 0.8);
        ctx!.globalAlpha = g * (0.55 + c.power * 0.45);
        ctx!.drawImage(coreSprite!, cx - r / 2, cy - r / 2, r, r);
      }
      // The afterglow's LIFE scales with the power as well, for the same reason the sparks' does: at a
      // flat 240ms the flurry's blooms overlapped each other and the three hits read as one long glow.
      const glowLife = 120 + c.power * 130;
      if (dt < glowLife) {
        const g = 1 - dt / glowLife;
        const r = stage.sh * (0.4 + c.power * 0.8) * (0.45 + (1 - g) * 0.75);
        ctx!.globalAlpha = g * g * (0.22 + c.power * 0.32);
        ctx!.drawImage(glowSprite!, cx - r / 2, cy - r / 2, r, r);
      }

      for (const s of c.sparks) {
        const age = dt - s.delay;
        if (age <= 0 || age >= s.life) continue;
        const at = (t: number) => {
          const sec = t / 1000;
          // Ballistic, in stage heights so the shower scales with the card: launched along its angle,
          // then gravity takes it. Drag is folded into the launch decay rather than integrated.
          const travel = s.speed * stage.sh * sec * (1 - sec * 0.5);
          return [
            cx + Math.cos(s.ang) * travel,
            cy + Math.sin(s.ang) * travel + 3.4 * stage.sh * sec * sec,
          ] as const;
        };
        const [x, y] = at(age);
        const [px0, py0] = at(Math.max(0, age - 26));
        const fade = 1 - age / s.life;
        const size = s.size * (0.5 + fade * 0.9) * sparkScale * Math.max(1.4, stage.sh * 0.035);
        // A streak, not a dot: a spark moving hundreds of px a second IS a line, and drawing it as a
        // point is the single biggest tell that a shower was faked.
        ctx!.globalAlpha = fade * 0.85;
        ctx!.strokeStyle = '#ffd48a';
        ctx!.lineWidth = Math.max(0.7, size * 0.42);
        ctx!.lineCap = 'round';
        ctx!.beginPath();
        ctx!.moveTo(px0, py0);
        ctx!.lineTo(x, y);
        ctx!.stroke();
        ctx!.globalAlpha = fade;
        ctx!.drawImage(glowSprite!, x - size / 2, y - size / 2, size, size);
        const core = size * 0.4;
        ctx!.drawImage(coreSprite!, x - core / 2, y - core / 2, core, core);
      }
    }
    ctx!.globalCompositeOperation = 'source-over';
    ctx!.globalAlpha = 1;
  }

  if (reduce) {
    // Frozen mid-bind: the one moment of the fight that is legible as a still, and the only one that
    // isn't a lie about motion.
    paint(STILL_MS);
    return () => {
      ro.disconnect();
      canvas.remove();
    };
  }

  // Desync the cards on a page, exactly as every particle effect's negative --delay does.
  const phase = Math.random() * LOOP_MS;
  let raf = 0;
  let dead = false;
  function frame(now: number): void {
    if (dead) return;
    paint(now + phase);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    canvas.remove();
  };
}

export const cardBladeDuel: CardEffectModule = {
  id: 'card-blade-duel',
  type: 'card_effect',
  costDust: 5200,
  since: '2026-08-11',
  className: 'card-fx-blade-duel',
  // `render` owns the whole layer; counts only need to be non-zero to get the layer created.
  counts: { web: 1, overlayCard: 1, overlayChat: 1 },
  labels: { name: 'shop.cardBladeDuel', desc: 'shop.cardBladeDuelDesc' },
  render,
};
