import { useState } from 'react';
import { clock } from '@/lib/format';
import { Icon } from '@/ui/icons';
import { MediaFrame, matHeightClass } from './MediaFrame';
import { VideoLightbox } from './VideoLightbox';
import type { MediaSize } from './types';

export interface VideoThumbProps {
  src: string;
  /** Подсказка длительности с сервера (сек) — для плашки длительности. */
  durationHintSec?: number;
  size?: MediaSize;
  label?: string;
  className?: string;
}

/**
 * Видео в очереди как в Telegram: статичный постер (первый кадр) + центральная кнопка Play
 * + плашка длительности, БЕЗ инлайн-контролов. Клик открывает лайтбокс-плеер (VideoLightbox),
 * который сразу запускает воспроизведение со звуком.
 */
export function VideoThumb({ src, durationHintSec, size = 'queue', label, className = '' }: VideoThumbProps) {
  const [open, setOpen] = useState(false);
  const hasDur = durationHintSec !== undefined && durationHintSec > 0;

  return (
    <MediaFrame kind="video" className={className}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label ?? 'Video'} — play`}
        className="relative block cursor-pointer outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
      >
        {/* Постер = первый кадр видео (#t=0.1 — чтобы не был чёрным). Не играет, не кликается. */}
        <video
          src={`${src}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          aria-hidden
          className={`pointer-events-none block w-auto max-w-full object-contain ${matHeightClass(size)}`}
        />
        {/* Центральная кнопка Play (диск) */}
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid size-12 place-items-center rounded-full border border-border bg-bg/70 text-text sm:size-14">
            <Icon name="play" size={24} />
          </span>
        </span>
        {/* Плашка длительности */}
        {hasDur && (
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-bg/80 px-1.5 py-0.5 text-xs tabular-nums text-text">
            {clock(Math.floor(durationHintSec))}
          </span>
        )}
      </button>
      <VideoLightbox
        src={src}
        label={label}
        durationHintSec={durationHintSec}
        open={open}
        onClose={() => setOpen(false)}
      />
    </MediaFrame>
  );
}
