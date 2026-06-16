import { useEffect, useRef, useState } from 'react';
import { clock } from '@/lib/format';
import { Icon, type IconName } from '@/ui/icons';
import { MediaFrame, matHeightClass } from './MediaFrame';
import { MediaButton } from './MediaButton';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeSlider';
import { useFullscreen, useMediaElement } from './useMediaElement';
import type { MediaSize } from './types';

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  size?: MediaSize;
  muted?: boolean;
  loop?: boolean;
  /** Длительность из сервера (сек) — подпись времени до загрузки метаданных. */
  durationHintSec?: number;
  label?: string;
  onPlay?: () => void;
  onEnded?: () => void;
  className?: string;
}

/** Видео-плеер с пиксельными контролами (см. AudioPlayer для аудио). */
export function VideoPlayer({
  src,
  poster,
  size = 'queue',
  muted = true,
  loop = false,
  durationHintSec,
  label,
  onPlay,
  onEnded,
  className = '',
}: VideoPlayerProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const m = useMediaElement(videoRef);
  const fs = useFullscreen(frameRef);
  const [barHidden, setBarHidden] = useState(false);
  const hideTimer = useRef<number>(0);

  // Сбрасываем плеер при смене src (object-URL не трогаем — им владеет вызывающий).
  useEffect(() => {
    videoRef.current?.load();
  }, [src]);

  // Внешние колбэки телеметрии («превью = эфир») — строго по переходу состояния.
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (m.playing && !wasPlaying.current) onPlay?.();
    wasPlaying.current = m.playing;
  }, [m.playing, onPlay]);
  const wasEnded = useRef(false);
  useEffect(() => {
    if (m.ended && !wasEnded.current) onEnded?.();
    wasEnded.current = m.ended;
  }, [m.ended, onEnded]);

  // Автоскрытие бара — только в полноэкранном во время игры; перезапуск по движению мыши.
  function revealBar() {
    window.clearTimeout(hideTimer.current);
    setBarHidden(false);
    if (fs.isFullscreen && m.playing) {
      hideTimer.current = window.setTimeout(() => setBarHidden(true), 2200);
    }
  }
  useEffect(() => {
    revealBar();
    return () => window.clearTimeout(hideTimer.current);
  }, [fs.isFullscreen, m.playing]);

  const total = m.ready && m.duration ? m.duration : durationHintSec && durationHintSec > 0 ? durationHintSec : 0;
  const known = total > 0;
  const compact = size === 'queue' && !fs.isFullscreen;
  const ariaLabel = label ?? 'Video';

  const showPlate = !m.error && !m.waiting && !m.playing && (m.current === 0 || m.ended);
  const plateIcon: IconName = m.ended ? 'reload' : 'play';

  function onPlateClick() {
    if (m.ended) m.replay();
    else m.toggle();
  }

  const bar = (
    <div
      className={`flex items-center gap-1.5 border-t-2 border-line bg-surface px-1.5 transition-opacity duration-150 sm:gap-2 sm:px-2 ${
        fs.isFullscreen ? 'h-10' : 'h-7 sm:h-8'
      } ${barHidden ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
    >
      <MediaButton
        icon={m.playing ? 'pause' : m.ended ? 'reload' : 'play'}
        label={m.playing ? 'Pause' : 'Play'}
        size={size}
        primary
        onClick={() => (m.ended ? m.replay() : m.toggle())}
      />
      <span className="shrink-0 font-body text-xs tabular-nums text-muted sm:text-sm">
        {clock(Math.floor(m.current))}
        {known && !compact ? ` / ${clock(Math.floor(total))}` : ''}
      </span>
      <SeekBar
        current={m.current}
        duration={m.ready ? m.duration : 0}
        buffered={m.buffered}
        cells={size === 'submit'}
        onSeek={m.seek}
        onScrubStart={m.beginScrub}
        onScrubEnd={m.endScrub}
        label={`${ariaLabel} — seek`}
        disabled={m.error}
      />
      <VolumeControl
        volume={m.volume}
        muted={m.muted}
        size={size}
        alwaysOpen={!compact}
        onToggleMute={m.toggleMute}
        onVolume={m.setVolume}
        label={`${ariaLabel} — volume`}
        disabled={m.error}
      />
      {fs.enabled && (
        <MediaButton
          icon={fs.isFullscreen ? 'fullscreen-exit' : 'fullscreen'}
          label={fs.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          size={size}
          onClick={fs.toggle}
        />
      )}
    </div>
  );

  const overlay = (
    <>
      {showPlate && (
        <div className="absolute inset-0 grid place-items-center">
          <button
            type="button"
            aria-label={m.ended ? 'Replay' : 'Play'}
            onClick={onPlateClick}
            className={`grid place-items-center rounded-none border-2 border-twitch bg-bg/70 text-twitch outline-twitch-light transition-colors duration-100 hover:border-twitch-light hover:bg-bg/85 focus-visible:outline-2 focus-visible:outline-offset-2 ${
              fs.isFullscreen ? 'h-20 w-20' : 'h-12 w-12 sm:h-14 sm:w-14'
            }`}
          >
            <Icon name={plateIcon} size={fs.isFullscreen ? 36 : 24} />
          </button>
        </div>
      )}
      {m.waiting && !m.error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Icon name="loader" size={fs.isFullscreen ? 40 : 28} className="pixel-spin text-twitch-light" />
        </div>
      )}
      {m.error && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-2 text-muted">
            <Icon name="square-alert" size={size === 'submit' ? 32 : 24} className="text-danger" />
          </div>
        </div>
      )}
    </>
  );

  return (
    <MediaFrame
      kind="video"
      rootRef={frameRef}
      fullscreen={fs.isFullscreen}
      bar={bar}
      overlay={overlay}
      className={className}
      role="group"
      aria-label={ariaLabel}
      data-media-player=""
      onKeyDown={(e) => {
        if (e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          m.toggle();
        }
      }}
      onMouseMove={revealBar}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={muted}
        loop={loop}
        playsInline
        preload="metadata"
        onClick={() => m.toggle()}
        className={`block max-w-full cursor-pointer object-contain [image-rendering:auto] ${
          fs.isFullscreen ? 'h-full max-h-full w-full' : matHeightClass(size)
        }`}
      />
    </MediaFrame>
  );
}
