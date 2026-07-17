import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import {
  bindRespawn,
  cardEffectClass,
  makeGroundGlows,
  makeParticles,
  particleCount,
  type Surface,
} from '@tmw/shared';

/**
 * Particle layer for an equipped card effect (levitation / stardust). Render as the first child
 * of a `relative` card; the layer clips itself (overflow), content above stays crisp. Particles
 * are randomized once per mount (useMemo) so they don't loop like a GIF.
 * `compact`: for very short containers (leaderboard rows) — particles travel a trajectory that
 * starts/ends OUTSIDE the row but is only visible while crossing it (clipped), so a whole comet
 * flies past quickly & smoothly without spilling onto neighbouring rows.
 * `surface`: which count to draw (see CardEffectModule.counts). Every real caller here is a web
 * surface and should leave it alone — it exists so the gallery can stand an overlay's density up
 * next to the web one, and a showcase that quietly drew the wrong count would be worse than none.
 */
export function CardEffect({
  effect,
  compact = false,
  surface = 'web',
}: {
  effect?: string | null;
  compact?: boolean;
  surface?: Surface;
}) {
  const count = effect ? particleCount(effect, surface) : 0;
  const particles = useMemo(
    () => makeParticles(effect ?? '', count, compact),
    [effect, count, compact],
  );
  // Ground glows bloom at each particle's bottom-edge crossing. Compact rows use per-effect
  // `.compact .g` keyframes phased to the clipped trajectory's actual crossing moment.
  const glows = useMemo(() => makeGroundGlows(effect ?? '', particles), [effect, particles]);
  // Each particle gets a fresh spawn column at the end of every cycle — without this a particle
  // loops in the one column it was born in, and the swarm reads as a row of taps rather than
  // weather. Imperative on purpose: it fires per animation cycle, which is no business of React's.
  const layerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = layerRef.current;
    if (!el || !effect) return;
    return bindRespawn(el, effect, particles, compact);
  }, [effect, particles, compact]);
  if (!count) return null;
  const cls = cardEffectClass(effect ?? '');
  return (
    <span ref={layerRef} className={`card-fx ${cls} ${compact ? 'compact' : ''}`} aria-hidden>
      {particles.map((style, i) => (
        <span key={i} className="p" style={style as CSSProperties} />
      ))}
      {glows.map((style, i) => (
        <span key={`g${i}`} className="g" style={style as CSSProperties} />
      ))}
    </span>
  );
}
