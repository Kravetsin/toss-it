import { useEffect, useRef } from 'react';
import { POP_CONCEPTS, type Concept, mountScene } from './pop';

/**
 * DRAFT bench for the "games/movies" card-effect group — eight scene concepts, each shown on a real
 * card box AND on a chat-row box, because a scene that only works at 190px tall is half an item.
 * Deliberately NOT in the cosmetics registry: registering one would put it in the shop at a price
 * nobody has agreed to. Delete this file, ./pop and the Section in GalleryPage once the survivors
 * move into packages/shared/src/cosmetics/effects.
 */

function Stage({ concept, compact }: { concept: Concept; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => mountScene(ref.current!, concept), [concept]);
  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-md)] border border-border bg-bg ${
        compact ? 'h-10' : 'h-48'
      }`}
    >
      <div ref={ref} className="pointer-events-none absolute inset-0" aria-hidden />
      {/* Fake card content, so the effect is judged BEHIND something rather than on a blank box. */}
      <div className={`relative flex items-center gap-2 ${compact ? 'h-full px-3' : 'p-3'}`}>
        <span className="size-6 shrink-0 rounded-full bg-surface-2" />
        <span className="text-sm text-text">viewer_name</span>
        {!compact && <span className="ml-auto label-mono text-faint">02:14</span>}
      </div>
      {!compact && (
        <div className="absolute inset-x-3 bottom-3 h-20 rounded-[var(--radius-sm)] bg-surface/70" />
      )}
    </div>
  );
}

export function PopBench() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {POP_CONCEPTS.map((c) => (
        <div key={c.id} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h3 className="text-text">{c.title}</h3>
            <span className="label-mono text-faint">{c.nod}</span>
            <span className="ml-auto label-mono text-faint">{(c.loopMs / 1000).toFixed(1)}s</span>
          </div>
          <Stage concept={c} />
          <Stage concept={c} compact />
          <p className="text-sm text-muted">{c.blurb}</p>
        </div>
      ))}
    </div>
  );
}
