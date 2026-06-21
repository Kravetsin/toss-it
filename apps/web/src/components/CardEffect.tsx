import { useMemo, type CSSProperties } from 'react';
import { makeParticles } from '@tmw/shared';

const COUNTS: Record<string, number> = { 'card-levitation': 10, 'card-stardust': 7 };

/**
 * Particle layer for an equipped card effect (levitation / stardust). Render as the first child
 * of a `relative overflow-hidden` card; the card clips it and content above stays crisp.
 * Particles are randomized once per mount (useMemo) so they don't loop like a GIF.
 */
export function CardEffect({ effect }: { effect?: string | null }) {
  const count = effect ? (COUNTS[effect] ?? 0) : 0;
  const particles = useMemo(() => makeParticles(effect ?? '', count), [effect, count]);
  if (!count) return null;
  const cls = effect === 'card-levitation' ? 'card-fx-levitation' : 'card-fx-stardust';
  return (
    <span className={`card-fx ${cls}`} aria-hidden>
      {particles.map((style, i) => (
        <span key={i} className="p" style={style as CSSProperties} />
      ))}
    </span>
  );
}
