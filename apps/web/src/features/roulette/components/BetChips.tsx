import { useEffect, useRef, useState } from 'react';
import { PAYOUT, type RouletteColor } from '@tmw/shared';
import { useI18n } from '@/i18n';

const COLORS: RouletteColor[] = ['red', 'black', 'green'];

const SWATCH: Record<RouletteColor, string> = {
  red: 'bg-[#b8342a]',
  black: 'bg-[#141a21] ring-1 ring-white/20',
  green: 'bg-accent',
};

/** How far the pointer must travel before this counts as a drag rather than a tap. */
const SLOP = 8;

/**
 * The three bets, as chips you throw at the wheel. There is no Spin button on purpose: the chip IS
 * the verb, so choosing a colour and committing to it are one motion instead of two.
 *
 * A tap plays too. Drag is the flourish and it is not discoverable enough to be the only way in —
 * and on a trackpad it is simply worse.
 */
export function BetChips({
  disabled,
  dropRef,
  onArm,
  onPlay,
}: {
  disabled?: boolean;
  /** The wheel. A chip released over it is a bet; released anywhere else it goes home. */
  dropRef: React.RefObject<HTMLElement | null>;
  /** Which colour is currently held over the wheel, so it can light its frame. */
  onArm: (c: RouletteColor | null) => void;
  onPlay: (c: RouletteColor) => void;
}) {
  const { t } = useI18n();
  const [held, setHeld] = useState<RouletteColor | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  // Read through refs: the window listeners are bound once per held chip and must not go stale.
  const onArmRef = useRef(onArm);
  onArmRef.current = onArm;
  const onPlayRef = useRef(onPlay);
  onPlayRef.current = onPlay;

  const overWheel = (x: number, y: number): boolean => {
    const box = dropRef.current?.getBoundingClientRect();
    return !!box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  };

  // Move and release are watched on the WINDOW, not on the chip. Pointer capture is the usual way
  // to do this and it is exactly what strands a chip: lose the capture — a cancelled gesture, a
  // pointer that left the surface — and the release never arrives, so the chip stays held and the
  // wheel stays armed with nothing to release it.
  useEffect(() => {
    if (!held) return;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - origin.current.x;
      const dy = e.clientY - origin.current.y;
      if (!moved.current && Math.hypot(dx, dy) < SLOP) return;
      moved.current = true;
      setGhost({ x: e.clientX, y: e.clientY });
      onArmRef.current(overWheel(e.clientX, e.clientY) ? held : null);
    };
    const up = (e: PointerEvent) => {
      const dragged = moved.current;
      setHeld(null);
      setGhost(null);
      onArmRef.current(null);
      // A tap plays; a drag plays only if it landed on the wheel, so changing your mind is just a
      // matter of letting go somewhere else.
      if (!dragged || overWheel(e.clientX, e.clientY)) onPlayRef.current(held);
    };
    const cancel = () => {
      setHeld(null);
      setGhost(null);
      onArmRef.current(null);
    };
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
    if (disabled) return;
    origin.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    setHeld(c);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            onPointerDown={down(c)}
            style={{ touchAction: 'none' }}
            className={`flex flex-1 cursor-grab select-none items-center justify-center gap-2 rounded-[var(--radius)] px-4 py-3 ring-1 ring-white/10 transition-all hover:ring-white/30 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 ${
              held === c ? 'opacity-40 ring-accent' : ''
            }`}
          >
            <span className={`size-4 rounded-full ${SWATCH[c]}`} />
            <span className="label-mono">{t(`roulette.color.${c}`)}</span>
            <span className="text-faint">×{PAYOUT[c]}</span>
          </button>
        ))}
      </div>

      {/* The chip in flight. Fixed and pointer-transparent so it never eats the drop it is part of. */}
      {held && ghost && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
          style={{ left: ghost.x, top: ghost.y }}
        >
          <span
            className={`block size-9 rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.6)] ${SWATCH[held]}`}
          />
        </div>
      )}
    </>
  );
}
