import { useMemo, type CSSProperties } from 'react';
import { cardEffectClass, makeGroundGlows, makeParticles, particleCount } from '@tmw/shared';

/**
 * Particle layer for an equipped card effect (levitation / stardust). Render as the first child
 * of a `relative` card; the layer clips itself (overflow), content above stays crisp. Particles
 * are randomized once per mount (useMemo) so they don't loop like a GIF.
 * `compact`: for very short containers (leaderboard rows) — particles travel a trajectory that
 * starts/ends OUTSIDE the row but is only visible while crossing it (clipped), so a whole comet
 * flies past quickly & smoothly without spilling onto neighbouring rows.
 */
export function CardEffect({
  effect,
  compact = false,
}: {
  effect?: string | null;
  compact?: boolean;
}) {
  const count = effect ? particleCount(effect, 'web') : 0;
  const particles = useMemo(() => makeParticles(effect ?? '', count), [effect, count]);
  // Ground glows bloom at each particle's bottom-edge crossing. Compact rows use per-effect
  // `.compact .g` keyframes phased to the clipped trajectory's actual crossing moment.
  const glows = useMemo(() => makeGroundGlows(effect ?? '', particles), [effect, particles]);
  if (!count) return null;
  const cls = cardEffectClass(effect ?? '');
  return (
    <span className={`card-fx ${cls} ${compact ? 'compact' : ''}`} aria-hidden>
      {particles.map((style, i) => (
        <span key={i} className="p" style={style as CSSProperties} />
      ))}
      {glows.map((style, i) => (
        <span key={`g${i}`} className="g" style={style as CSSProperties} />
      ))}
    </span>
  );
}
