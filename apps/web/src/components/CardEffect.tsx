import { useEffect, useRef } from 'react';
import { cardEffectLayerClass, fillCardEffect, type Surface } from '@tmw/shared';

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
  // React owns the layer ELEMENT — it must, it is part of its tree, and its `border-radius: inherit`
  // has to read the card directly. The registry owns everything inside it: React never rendered the
  // particles as JSX anyway in any honest sense, since their spawn columns are rewritten from a
  // per-cycle animation event that React neither sees nor should.
  const layerRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = layerRef.current;
    if (!el || !effect) return;
    return fillCardEffect(el, effect, surface, compact);
  }, [effect, compact, surface]);
  const cls = effect ? cardEffectLayerClass(effect, surface, compact) : '';
  if (!cls) return null;
  return <span ref={layerRef} className={cls} aria-hidden />;
}
