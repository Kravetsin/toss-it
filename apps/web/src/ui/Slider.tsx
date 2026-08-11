import { Icon, type IconName } from './icons';

export function Slider({
  icon,
  label,
  min,
  max,
  step,
  value,
  onChange,
  onCommit,
}: {
  icon: IconName;
  label: string;
  min: number;
  max: number;
  /** Snap increment; omit for the default of 1. */
  step?: number;
  value: number;
  onChange: (v: number) => void;
  /** Fires on release (pointer up / key up) — for instant-save sliders, to avoid saving mid-drag. */
  onCommit?: (v: number) => void;
}) {
  const commit = (e: { currentTarget: HTMLInputElement }) =>
    onCommit?.(Number(e.currentTarget.value));
  const pct = max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <label className="text-sm text-muted">
      <span className="flex items-center gap-1.5">
        <Icon name={icon} size={15} />
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        className="slider-star mt-1"
        style={{ ['--val' as string]: `${pct}%` }}
      />
    </label>
  );
}
