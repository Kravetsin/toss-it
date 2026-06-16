import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { clock } from '@/lib/format';

interface SeekBarProps {
  current: number; // сек
  duration: number; // сек (0/не-конечная ⇒ неопределённый прогресс)
  buffered?: number; // сек (для видео)
  cells?: boolean; // пиксельная «ячеистая» текстура заливки
  onSeek: (sec: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  label: string;
  disabled?: boolean;
}

/**
 * Полоса перемотки: прозрачный нативный <input type="range"> (даёт указатель,
 * клавиатуру и a11y) поверх слоёв-divов, нарисованных как прогресс-бар оверлея.
 */
export function SeekBar({
  current,
  duration,
  buffered = 0,
  cells = false,
  onSeek,
  onScrubStart,
  onScrubEnd,
  label,
  disabled = false,
}: SeekBarProps) {
  const [scrubVal, setScrubVal] = useState<number | null>(null);
  const scrubbing = scrubVal !== null;

  const known = duration > 0 && Number.isFinite(duration);
  const indeterminate = !known && !disabled;
  const value = scrubbing ? (scrubVal as number) : current;
  const playedPct = known ? Math.min(100, (value / duration) * 100) : 0;
  const bufferedPct = known ? Math.min(100, (buffered / duration) * 100) : 0;
  const max = known ? duration : 1;

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    e.stopPropagation(); // не даём долететь до хоткеев очереди модерации
    if (disabled || !known) return;
    const step = e.shiftKey ? 1 : 5;
    const targets: Record<string, number> = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      Home: 0,
      End: duration,
      PageUp: value + 30,
      PageDown: value - 30,
    };
    const next = targets[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setScrubVal(null);
    onSeek(Math.max(0, Math.min(next, duration)));
  }

  function handlePointerDown() {
    if (disabled || !known) return;
    setScrubVal(value);
    onScrubStart?.();
  }
  function handlePointerUp(e: PointerEvent<HTMLInputElement>) {
    if (scrubVal === null) return;
    onSeek(Number(e.currentTarget.value));
    setScrubVal(null);
    onScrubEnd?.();
  }

  return (
    <div
      className={`relative my-auto h-2.5 flex-1 rounded-none border-2 border-line bg-surface-2 outline-twitch-light [box-shadow:inset_2px_2px_0_0_var(--color-bg)] focus-within:outline-2 focus-within:outline-offset-2 ${
        disabled ? 'opacity-40' : 'cursor-pointer'
      } group/seek`}
    >
      {indeterminate ? (
        <div className="progress-indeterminate absolute inset-y-0 left-0 w-1/3 bg-twitch/70" aria-hidden />
      ) : (
        <>
          <div
            className="pointer-events-none absolute inset-y-0 left-0 bg-line"
            style={{ width: `${bufferedPct}%` }}
            aria-hidden
          />
          <div
            className={`pointer-events-none absolute inset-y-0 left-0 bg-twitch [box-shadow:inset_-2px_0_0_0_var(--color-twitch-dark)] ${cells ? 'seek-cells' : ''}`}
            style={{ width: `${playedPct}%` }}
            aria-hidden
          />
          <div
            className="pointer-events-none absolute top-1/2 h-3.5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-none border-2 border-twitch-dark bg-twitch-light opacity-0 transition-opacity duration-100 group-hover/seek:opacity-100 group-focus-within/seek:opacity-100"
            style={{ left: `${playedPct}%` }}
            aria-hidden
          />
        </>
      )}
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(value, max)}
        disabled={disabled || indeterminate}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (scrubbing) setScrubVal(v);
          onSeek(v);
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onKeyDown={handleKey}
        aria-label={label}
        aria-valuetext={`${clock(Math.floor(value))} / ${known ? clock(Math.floor(duration)) : '∞'}`}
        className="seek-native absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
    </div>
  );
}
