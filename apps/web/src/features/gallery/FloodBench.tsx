import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/ui';
import { FLOOD_CONCEPTS, type FloodConcept, injectFloodStyles } from './flood';

/**
 * DRAFT bench for the RARE FLOOD on frames — the card briefly fills with its frame's element. Each
 * concept is shown on a card box AND on a chat pill, because a flood that only works at 190px tall
 * is half an item, and wearing the real catalogue frame underneath is the point: the flood has to
 * coexist with the ring, not replace it.
 *
 * The event is a ONE-SHOT driven by a class (see ./flood/css.ts), exactly as production would do it:
 * roll the dice when the card mounts, add the class, drop it when it ends. Delete this file, ./flood
 * and the Section in GalleryPage once a survivor moves into the cosmetics registry.
 */

/** Runs the one-shot: `on` for `ms`, restartable mid-flight (the class has to drop for a frame or
 *  the browser keeps the finished animation and nothing replays). */
function useOneShot(ms: number): [boolean, () => void] {
  const [on, setOn] = useState(false);
  const timer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const fire = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
    setOn(false);
    raf.current = requestAnimationFrame(() => {
      setOn(true);
      timer.current = window.setTimeout(() => setOn(false), ms);
    });
  }, [ms]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );
  return [on, fire];
}

function Stage({
  concept,
  compact,
  on,
}: {
  concept: FloodConcept;
  compact?: boolean;
  on: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-md)] border border-border bg-bg ${
        concept.frameClass
      } ${compact ? 'h-10' : 'h-48'}`}
    >
      <div
        className={`flood-fx ${concept.cls} ${on ? 'is-on' : ''}`}
        style={{ '--fd': `${concept.ms}ms` } as CSSProperties}
        aria-hidden
      >
        {concept.parts(!!compact).map((p, i) => (
          <span key={i} className={p.cls} style={p.style as CSSProperties} />
        ))}
      </div>
      {/* Fake card content, so the flood is judged BEHIND something rather than on a blank box. */}
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

function ConceptRow({ concept, tick }: { concept: FloodConcept; tick: number }) {
  const [on, fire] = useOneShot(concept.ms);
  // tick 0 is the first render — auto-play on mount would fire every concept at once on page load.
  useEffect(() => {
    if (tick > 0) fire();
  }, [tick, fire]);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-text">{concept.title}</h3>
        <span className="label-mono text-faint">{(concept.ms / 1000).toFixed(1)}s</span>
        <span className="ml-auto">
          <Button variant="ghost" size="sm" onClick={fire}>
            Разлив
          </Button>
        </span>
      </div>
      <Stage concept={concept} on={on} />
      <Stage concept={concept} on={on} compact />
      <p className="text-sm text-muted">{concept.blurb}</p>
    </div>
  );
}

export function FloodBench() {
  const [tick, setTick] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => injectFloodStyles(), []);
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 7000);
    return () => clearInterval(id);
  }, [auto]);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setTick((t) => t + 1)}>
          Проиграть все
        </Button>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          повтор каждые 7s
        </label>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {FLOOD_CONCEPTS.map((c) => (
          <ConceptRow key={c.id} concept={c} tick={tick} />
        ))}
      </div>
    </div>
  );
}
