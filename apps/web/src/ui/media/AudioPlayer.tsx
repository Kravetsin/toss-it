import { useEffect, useRef } from 'react';
import { clock } from '@/lib/format';
import { Icon } from '@/ui/icons';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { MediaButton } from './MediaButton';
import { SeekBar } from './SeekBar';
import { VolumeControl } from './VolumeSlider';
import { useMediaElement } from './useMediaElement';
import type { MediaSize } from './types';

export interface AudioPlayerProps {
  src: string;
  size?: MediaSize;
  durationHintSec?: number;
  /** Пиксельный эквалайзер (авто-выкл. при системном reduce-motion). */
  equalizer?: boolean;
  loop?: boolean;
  label?: string;
  onPlay?: () => void;
  onEnded?: () => void;
  className?: string;
}

/**
 * Аудио-«картридж»: самого медиа не видно, виджет повторяет язык музыкального
 * плеера оверлея (тиловая рамка + верхняя циан-кромка) — превью читается как
 * родственник того, что увидит зритель в эфире.
 */
export function AudioPlayer({
  src,
  size = 'queue',
  durationHintSec,
  equalizer = true,
  loop = false,
  label,
  onPlay,
  onEnded,
  className = '',
}: AudioPlayerProps) {
  const m = useMediaElement();
  const reduced = useReducedMotion();
  const showEq = equalizer && !reduced && !m.error;
  const ariaLabel = label ?? 'Audio';

  useEffect(() => {
    m.el.current?.load();
  }, [src, m.el]);
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

  const total = m.ready && m.duration ? m.duration : durationHintSec && durationHintSec > 0 ? durationHintSec : 0;
  const known = total > 0;

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-media-player=""
      onKeyDown={(e) => {
        if (e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          if (m.ended) m.replay();
          else m.toggle();
        }
      }}
      className={`flex h-11 items-center gap-2 rounded-none border border-border bg-surface px-2 text-text [box-shadow:inset_0_1px_0_0_var(--color-accent),var(--shadow-2)] sm:gap-2.5 sm:px-2.5 ${className}`}
    >
      <audio ref={m.attach} src={src} loop={loop} preload="metadata" hidden aria-hidden="true" />
      <MediaButton
        icon={m.error ? 'square-alert' : m.playing ? 'pause' : m.ended ? 'reload' : 'play'}
        label={m.playing ? 'Pause' : 'Play'}
        size={size}
        primary
        disabled={m.error}
        onClick={() => (m.ended ? m.replay() : m.toggle())}
      />
      {showEq && (
        <span className="eq shrink-0" data-on={m.playing} aria-hidden>
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      )}
      <SeekBar
        current={m.current}
        duration={m.ready ? m.duration : 0}
        onSeek={m.seek}
        onScrubStart={m.beginScrub}
        onScrubEnd={m.endScrub}
        label={`${ariaLabel} — seek`}
        disabled={m.error}
      />
      <span className="shrink-0 font-body text-xs tabular-nums text-muted sm:text-sm">
        {m.error ? (
          <Icon name="square-alert" size={16} className="text-danger" />
        ) : (
          `${clock(Math.floor(m.current))} / ${known ? clock(Math.floor(total)) : '∞'}`
        )}
      </span>
      <VolumeControl
        volume={m.volume}
        muted={m.muted}
        size={size}
        alwaysOpen={size === 'submit'}
        onToggleMute={m.toggleMute}
        onVolume={m.setVolume}
        label={`${ariaLabel} — volume`}
        disabled={m.error}
      />
    </div>
  );
}
