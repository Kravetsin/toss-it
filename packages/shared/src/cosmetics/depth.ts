/**
 * Shared depth vocabulary for card effects: the plane a particle sits on, and the two constants
 * that make every effect read as the SAME lens. An effect opts in by asking `depthPlane(index)` and
 * deciding what "closer" means for its own particle (size, speed, drift); everything about how
 * depth is distributed and how sharp each plane is lives here, not in the effect.
 *
 * Sizing the swarm is `depthCount(inFocus)`: the off-focus planes are an ADDITION, not a tax. The
 * first version of this spent the existing count on depth, which quietly halved the effect — you
 * bought blur by deleting the thing being blurred.
 */

/** Which depth plane a particle sits on. 'mid' is the in-focus plane — the card's own surface. */
export type DepthPlane = 'near' | 'mid' | 'far';

/** Particles per repeat of the quota pattern (1 near + 1 far + 5 in focus). */
const SLOTS = 7;
const IN_FOCUS_PER_SLOTS = 5;

/**
 * The plane for a particle, by its index in the swarm. A QUOTA, not a roll: rolling per particle is
 * independent draws, so the off-focus planes clump and the in-focus one thins out at random — a
 * 9-petal sakura came up 2-in-focus, which is a blur with a garnish rather than an effect with
 * depth. By index the mix is exact in every swarm, on every surface, every mount.
 */
export function depthPlane(index: number): DepthPlane {
  const slot = index % SLOTS;
  if (slot === 0) return 'near';
  if (slot === 4) return 'far';
  return 'mid';
}

/**
 * Blur as a RATIO of the particle's own rendered size — never a fixed px. Defocus is angular: a
 * closer particle is both bigger and blurrier, and holding the ratio is what keeps the planes
 * looking like one lens instead of three. As a constant it also destroyed the near plane, since the
 * same 4px means nothing to a 6px particle and erases a 16px one into a formless blob.
 *
 * Two ratios, because how much blur reads as "out of focus" depends on what the particle IS:
 *
 * SHAPED — a petal, a streak: the outline carries the identity, and blur eats it. Stay mild; past
 * this the petal is a smudge and the effect has argued itself out of existence.
 *
 * POINT — a flake, a spark, a mint dot: no shape to lose, so the soft disc IS the bokeh and the only
 * cue that it is defocused at all. Needs roughly 2.5× the shaped ratio before it stops reading as
 * merely a bigger dot.
 */
export const DEPTH_BLUR_RATIO_SHAPED: Record<DepthPlane, number> = { near: 0.13, mid: 0, far: 0.1 };
export const DEPTH_BLUR_RATIO_POINT: Record<DepthPlane, number> = { near: 0.34, mid: 0, far: 0.2 };

/**
 * How hard speed tracks size. Physically a particle's apparent speed is proportional to its apparent
 * size (both scale with 1/distance), i.e. exponent 1. Softened to 0.8 because the size ranges here
 * span ~9×, and a literal 9× speed range turns the near plane into streaks — snow stops being snow.
 */
const PARALLAX_EXP = 0.8;

/**
 * Travel duration for a particle of relative size `z` (1 = the effect's in-focus norm), given the
 * duration a z=1 particle should take. `jitter` is the effect's own excuse for variety (wind, etc).
 *
 * Speed is NOT a free roll, and this is the whole point of the helper: when each plane got its own
 * random speed band, size still varied ~3× WITHIN a plane, so a big flake routinely fell slower than
 * a small one right next to it. Depth then reads as broken rather than absent — the eye knows that
 * the closer thing crosses the frame faster, and it notices when it doesn't. Deriving speed from
 * size makes the swarm one continuous depth field; the planes then only decide the size band and
 * the blur.
 */
export function parallaxDur(baseDur: number, z: number, jitter = 1): number {
  return (baseDur / Math.pow(z, PARALLAX_EXP)) * jitter;
}

/**
 * Total swarm size that leaves `inFocus` particles on the in-focus plane, so an effect states the
 * density it actually wants to look like and the depth planes come on top. Pair it with
 * `depthPlane(index)` — the two share the same quota.
 */
export function depthCount(inFocus: number): number {
  return Math.round((inFocus * SLOTS) / IN_FOCUS_PER_SLOTS);
}
