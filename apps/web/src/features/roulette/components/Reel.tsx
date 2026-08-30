import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { colorOfSlot, WHEEL_ORDER, type RouletteColor } from '@tmw/shared';

/** How long a spin takes. Short on purpose: this is watched dozens of times in a row, and anything
 *  with a wind-up stops being exciting on the third viewing and starts being a wait. */
export const SPIN_MS = 2800;

const CELL_PX = 56;
/** Three copies of the wheel: start on the first, land on the third, travel two full wheels. */
const STRIP = [...WHEEL_ORDER, ...WHEEL_ORDER, ...WHEEL_ORDER];

const CELL_CLASS: Record<RouletteColor, string> = {
  red: 'bg-[#c0392f] text-white/90',
  black: 'bg-[#12171d] text-white/70',
  // The jackpot wears the brand mint rather than a casino green: it is the one slot worth looking
  // for, and on this palette mint is what "worth looking at" already means.
  green: 'bg-accent text-[#0b0f0f]',
};

/**
 * The wheel as a sliding reel rather than a spinning disc. At any size a 37-sector disc turns to
 * mush, while a strip stays readable, costs one transform to animate, and lands on an exact cell —
 * which matters because the SERVER decides the slot and the picture only has to agree with it.
 */
export function Reel({ slot, spinning }: { slot: number | null; spinning: boolean }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const [animate, setAnimate] = useState(false);

  // Measured, not assumed: the reel is centred on the viewport, and on mount that width is 0 until
  // layout has run — the same trap the overlay hits when it reads innerWidth too early.
  const centreOf = (index: number): number => {
    const w = viewport.current?.clientWidth ?? 0;
    return w / 2 - index * CELL_PX - CELL_PX / 2;
  };

  useLayoutEffect(() => {
    setOffset(centreOf(0));
  }, []);

  useEffect(() => {
    if (!spinning || slot === null) return;
    const landing = WHEEL_ORDER.indexOf(slot);
    if (landing < 0) return;

    // Jump back to the same pocket on the FIRST copy with no transition, so every spin travels the
    // same distance however the last one ended — then animate to the third copy.
    setAnimate(false);
    setOffset(centreOf(landing));
    // Two frames, not one: the first lets React commit the transition-less reset and the browser
    // paint it. Starting the transition in the same frame would animate from wherever the PREVIOUS
    // spin stopped, so the travel — and with it the perceived speed — would differ every time.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        setAnimate(true);
        // Land a little off-centre so consecutive spins don't look like a rerun of the same frame.
        const jitter = (WHEEL_ORDER.length * 37 * ((landing % 7) + 1)) % (CELL_PX * 0.5);
        setOffset(centreOf(landing + WHEEL_ORDER.length * 2) + jitter - CELL_PX * 0.25);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [spinning, slot]);

  return (
    <div
      ref={viewport}
      className="relative h-16 w-full overflow-hidden rounded-[var(--radius)] border border-white/10 bg-black/30"
    >
      <div
        className="flex h-full will-change-transform"
        style={{
          transform: `translateX(${offset}px)`,
          transition: animate ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.72, 0.16, 1)` : 'none',
        }}
      >
        {STRIP.map((n, i) => (
          <div
            key={i}
            className={`flex shrink-0 items-center justify-center border-r border-black/40 font-mono text-sm font-bold ${CELL_CLASS[colorOfSlot(n)]}`}
            style={{ width: CELL_PX }}
          >
            {n}
          </div>
        ))}
      </div>
      {/* The marker reads the result, so it sits above the strip and never moves. */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)]" />
    </div>
  );
}
