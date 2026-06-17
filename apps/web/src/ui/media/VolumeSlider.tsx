import type { IconName } from '@/ui/icons';
import { MediaButton } from './MediaButton';
import type { MediaSize } from './types';

/** Иконка громкости по уровню/муту (общая для видео и аудио). */
export function volumeIcon(muted: boolean, volume: number): IconName {
  if (muted || volume === 0) return 'volume-x';
  if (volume <= 0.34) return 'volume-1';
  if (volume <= 0.67) return 'volume-2';
  return 'volume-3';
}

interface VolumeSliderProps {
  volume: number; // 0..1
  muted: boolean;
  onChange: (v: number) => void;
  label: string;
}

/** Сам ползунок громкости в стиле сикбара (прозрачный range поверх слоёв). */
export function VolumeSlider({ volume, muted, onChange, label }: VolumeSliderProps) {
  const pct = muted ? 0 : Math.round(volume * 100);
  return (
    <div className="relative my-auto h-2 w-14 shrink-0 border border-border bg-surface-2 outline-none focus-within:[box-shadow:var(--shadow-focus)]">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-accent"
        style={{ width: `${pct}%` }}
        aria-hidden
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => onChange(Number(e.target.value))}
        onKeyDown={(e) => e.stopPropagation()}
        aria-label={label}
        aria-valuetext={`${pct}%`}
        className="seek-native absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );
}

interface VolumeControlProps {
  volume: number;
  muted: boolean;
  size?: MediaSize;
  /** true — ползунок виден всегда; false — раскрывается при наведении/фокусе. */
  alwaysOpen?: boolean;
  onToggleMute: () => void;
  onVolume: (v: number) => void;
  /** базовая подпись, напр. "<медиа> — volume". */
  label: string;
  disabled?: boolean;
}

/**
 * Громкость = кнопка мута + ползунок. Регулировка доступна всегда: в просторных
 * плеерах ползунок показан рядом постоянно, в компактных — выезжает при наведении
 * на кнопку или при фокусе с клавиатуры (group-hover / group-focus-within).
 */
export function VolumeControl({
  volume,
  muted,
  size = 'queue',
  alwaysOpen = false,
  onToggleMute,
  onVolume,
  label,
  disabled = false,
}: VolumeControlProps) {
  return (
    <div className="group/vol flex shrink-0 items-center">
      <MediaButton
        icon={volumeIcon(muted, volume)}
        label={muted ? 'Unmute' : 'Mute'}
        size={size}
        pressed={muted}
        disabled={disabled}
        onClick={onToggleMute}
      />
      <div
        className={`flex items-center overflow-hidden transition-[width,opacity,margin] duration-150 ${
          alwaysOpen
            ? 'ml-1.5 w-14 opacity-100'
            : 'w-0 opacity-0 group-hover/vol:ml-1.5 group-hover/vol:w-14 group-hover/vol:opacity-100 group-focus-within/vol:ml-1.5 group-focus-within/vol:w-14 group-focus-within/vol:opacity-100'
        }`}
      >
        <VolumeSlider volume={volume} muted={muted} onChange={onVolume} label={label} />
      </div>
    </div>
  );
}
