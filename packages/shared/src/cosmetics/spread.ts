/**
 * Van der Corput (base 2): 0.5, 0.25, 0.75, 0.125, 0.625, … — the bit-reversed index, in [0, 1). Each
 * new point lands in the largest remaining gap, so ANY prefix of the sequence is evenly spread.
 *
 * This answers a problem every card effect eventually hits: `particle()` knows its own index but never
 * how many particles the swarm has, so "spread N of these evenly" cannot be computed — and a fixed
 * step tuned for five huddles three of them at one end. Positions (the candles' row) and phases (the
 * claw strikes' timing) are the same problem on two different axes, and this solves both, including on
 * surfaces whose counts differ.
 */
export function vdc(index: number): number {
  let denom = 2;
  let out = 0;
  for (let n = index + 1; n > 0; n = Math.floor(n / 2)) {
    if (n % 2) out += 1 / denom;
    denom *= 2;
  }
  return out;
}
