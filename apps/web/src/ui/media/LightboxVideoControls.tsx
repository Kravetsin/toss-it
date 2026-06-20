import { useEffect, useRef, useState } from 'react';
import { clock } from '@/lib/format';
import { Icon } from '@/ui/icons';
import { MediaButton } from './MediaButton';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeSlider';
import type { useFullscreen, useMediaElement } from './useMediaElement';

const SPEEDS = [0.5, 1, 1.5, 2];

interface LightboxVideoControlsProps {
  m: ReturnType<typeof useMediaElement>;
  fs: ReturnType<typeof useFullscreen>;
  durationHintSec?: number;
  label: string;
  /** Сообщаем наверх, открыто ли меню скорости — чтобы авто-скрытие не прятало панель. */
  onMenuOpenChange: (open: boolean) => void;
}

/** Меню скорости воспроизведения (шестерёнка → попап со списком). */
function SpeedMenu({
  rate,
  onRate,
  onOpenChange,
}: {
  rate: number;
  onRate: (r: number) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => onOpenChange(open), [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // Capture + stopPropagation: Esc закрывает меню, а не всю модалку.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    // Фокус на выбранной скорости при открытии.
    const sel =
      menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ??
      menuRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]');
    sel?.focus();
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center">
      <MediaButton
        icon="settings"
        label="Playback speed"
        size="submit"
        pressed={open}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div
          ref={menuRef}
          role="menu"
          // Гасим всплытие клавиш (стрелки/пробел) — иначе долетят до плеера и изменят громкость.
          // Стрелки ↑/↓ двигают выделение по пунктам (roving focus).
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const items = Array.from(
              menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [],
            );
            const i = items.indexOf(document.activeElement as HTMLElement);
            const n = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
            items[n]?.focus();
          }}
          className="absolute bottom-full right-0 mb-2 min-w-[6rem] rounded-[var(--radius-sm)] border border-border bg-surface p-1 shadow-3"
        >
          {SPEEDS.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={r === rate}
              onClick={() => {
                onRate(r);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-sm tabular-nums outline-none transition-colors duration-100 focus-visible:[box-shadow:var(--shadow-focus)] ${
                r === rate ? 'text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'
              }`}
            >
              <span>{`${r}×`}</span>
              {r === rate && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Содержимое панели контролов видео в лайтбоксе (Telegram-стиль). Верхний ряд — перемотка
 * с таймкодами, нижний — громкость слева, play/pause по центру, скорость/PiP/фуллскрин справа.
 * Сама плашка (фон/позиция/видимость) — на стороне VideoLightbox; здесь только содержимое.
 */
export function LightboxVideoControls({
  m,
  fs,
  durationHintSec,
  label,
  onMenuOpenChange,
}: LightboxVideoControlsProps) {
  const total = m.ready && m.duration ? m.duration : durationHintSec && durationHintSec > 0 ? durationHintSec : 0;
  const known = total > 0;
  const remaining = known ? Math.max(0, total - m.current) : 0;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2.5">
      {/* Ряд перемотки: текущее · полоса · оставшееся */}
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 text-sm tabular-nums text-text/90">{clock(Math.floor(m.current))}</span>
        <SeekBar
          current={m.current}
          duration={m.ready ? m.duration : 0}
          buffered={m.buffered}
          onSeek={m.seek}
          onScrubStart={m.beginScrub}
          onScrubEnd={m.endScrub}
          label={`${label} — seek`}
          disabled={m.error}
        />
        <span className="shrink-0 text-sm tabular-nums text-text/90">
          {known ? `-${clock(Math.floor(remaining))}` : ''}
        </span>
      </div>

      {/* Ряд кнопок: громкость слева · play по центру · скорость/PiP/фуллскрин справа */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 items-center">
          <VolumeControl
            volume={m.volume}
            muted={m.muted}
            size="submit"
            alwaysOpen
            onToggleMute={m.toggleMute}
            onVolume={m.setVolume}
            label={`${label} — volume`}
            disabled={m.error}
          />
        </div>
        <MediaButton
          icon={m.playing ? 'pause' : m.ended ? 'reload' : 'play'}
          label={m.playing ? 'Pause' : 'Play'}
          size="submit"
          primary
          onClick={() => (m.ended ? m.replay() : m.toggle())}
        />
        <div className="flex flex-1 items-center justify-end gap-1">
          <SpeedMenu rate={m.rate} onRate={m.setRate} onOpenChange={onMenuOpenChange} />
          {m.pipSupported && (
            <MediaButton
              icon="picture-in-picture"
              label="Picture in picture"
              size="submit"
              pressed={m.pip}
              onClick={m.togglePip}
            />
          )}
          {fs.enabled && (
            <MediaButton
              icon={fs.isFullscreen ? 'fullscreen-exit' : 'fullscreen'}
              label={fs.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              size="submit"
              onClick={fs.toggle}
            />
          )}
        </div>
      </div>
    </div>
  );
}
