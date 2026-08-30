import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PAYOUT, type RouletteColor } from '@tmw/shared';

const COLORS: RouletteColor[] = ['red', 'black', 'green'];

const SWATCH: Record<RouletteColor, string> = {
  red: 'bg-[#b8342a]',
  black: 'bg-[#141a21] ring-1 ring-white/25',
  green: 'bg-accent',
};
/** The multiplier is printed ON the tile, so it needs to read against that exact fill. */
const INK: Record<RouletteColor, string> = {
  red: 'text-white/90',
  black: 'text-white/70',
  green: 'text-[#08160f]',
};

function Tile({ colour, className = '' }: { colour: RouletteColor; className?: string }) {
  return (
    <span
      className={`grid size-11 place-items-center rounded-xl font-mono text-sm font-bold ${SWATCH[colour]} ${INK[colour]} ${className}`}
    >
      ×{PAYOUT[colour]}
    </span>
  );
}

/** How far the pointer must travel before a press counts as a drag. */
const SLOP = 8;

/**
 * The three bets, as bare colour tiles thrown at the wheel.
 *
 * DRAG ONLY, deliberately. A tap would put someone's stake one misclick away, and the whole point of
 * throwing a chip is that committing takes an act of intent rather than a twitch.
 *
 * A thrown tile leaves its slot and stays gone until the wheel has stopped — it is on the wheel, so
 * it cannot also be sitting in the tray — and then drops back into place.
 */
export function BetChips({
  disabled,
  away,
  hitTest,
  onArm,
  onPlay,
}: {
  disabled?: boolean;
  /** The tile currently out on the wheel; null once the spin has settled and it may come home. */
  away: RouletteColor | null;
  /** Whether a client point is on the wheel's band. Geometry, not DOM: the band is drawn. */
  hitTest: (x: number, y: number) => boolean;
  /** Which colour is over the wheel right now, so its frame can light up. */
  onArm: (c: RouletteColor | null) => void;
  onPlay: (c: RouletteColor) => void;
}) {
  const [held, setHeld] = useState<RouletteColor | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  // Read through refs: the window listeners bind once per held tile and must not go stale.
  const onArmRef = useRef(onArm);
  onArmRef.current = onArm;
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;
  const hitRef = useRef(hitTest);
  hitRef.current = hitTest;

  // Move and release are watched on the WINDOW, not on the tile. Pointer capture is the usual way
  // and it is exactly what strands a chip: lose the capture — a cancelled gesture, a pointer that
  // left the surface — and the release never arrives, so the tile stays held forever.
  useEffect(() => {
    if (!held) return;
    const move = (e: PointerEvent) => {
      const d = Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y);
      if (!moved.current && d < SLOP) return;
      moved.current = true;
      setGhost({ x: e.clientX, y: e.clientY });
      onArmRef.current(hitRef.current(e.clientX, e.clientY) ? held : null);
    };
    const finish = (e: PointerEvent | null) => {
      const landed = !!e && moved.current && hitRef.current(e.clientX, e.clientY);
      setHeld(null);
      setGhost(null);
      onArmRef.current(null);
      if (landed) onPlayRef.current(held);
    };
    const up = (e: PointerEvent) => finish(e);
    const cancel = () => finish(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [held]);

  const down = (c: RouletteColor) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || away) return;
    origin.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    setHeld(c);
  };

  return (
    <>
      <div className="flex items-center justify-center gap-3">
        {COLORS.map((c) => {
          // Empty only while something is actually representing the tile elsewhere: out on the
          // wheel, or under the cursor as a ghost. A press alone must not empty it, or the first
          // few pixels of a drag are spent holding nothing. The socket keeps its size either way,
          // so nothing shifts under the finger and the tile has somewhere to fall back into.
          const gone = away === c || (held === c && !!ghost);
          return (
            <button
              key={c}
              type="button"
              disabled={disabled}
              onPointerDown={down(c)}
              style={{ touchAction: 'none' }}
              aria-label={c}
              className="grid size-14 cursor-grab place-items-center rounded-2xl ring-1 ring-inset ring-white/10 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Tile
                colour={c}
                className={`shadow-[0_4px_14px_rgba(0,0,0,0.45)] transition-[transform,opacity] duration-300 ${
                  gone ? 'scale-50 opacity-0' : 'scale-100 opacity-100'
                }`}
              />
            </button>
          );
        })}
      </div>

      {/* The tile in flight, PORTALLED to the body. The drawer animates with a transform, and a
          transformed ancestor becomes the containing block for `position: fixed` — inside it these
          client coordinates land a drawer-height below the pointer, off the bottom of the screen,
          which reads exactly like the tile vanishing on pickup. */}
      {held &&
        ghost &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[60] -translate-x-1/2 -translate-y-1/2"
            style={{ left: ghost.x, top: ghost.y }}
          >
            <Tile colour={held} className="shadow-[0_8px_26px_rgba(0,0,0,0.7)]" />
          </div>,
          document.body,
        )}
    </>
  );
}
