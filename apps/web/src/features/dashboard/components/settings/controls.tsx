import { OVERLAY_POSITIONS, positionToFlex, type OverlayPosition } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';

export function Slider({
  icon,
  label,
  min,
  max,
  value,
  onChange,
  onCommit,
}: {
  icon: IconName;
  label: string;
  min: number;
  max: number;
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

/** 3×3 position anchor grid; dot position matches corner via positionToFlex. */
export function PositionGrid({
  value,
  onChange,
}: {
  value: OverlayPosition;
  onChange: (p: OverlayPosition) => void;
}) {
  return (
    <div className="mt-1 grid w-max grid-cols-3 gap-1">
      {OVERLAY_POSITIONS.map((p) => {
        const { justify, align } = positionToFlex(p);
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            aria-label={p}
            aria-pressed={active}
            onClick={() => onChange(p)}
            style={{ justifyContent: justify, alignItems: align }}
            className={`flex h-9 w-9 cursor-pointer border p-1.5 transition-colors ${
              active
                ? 'border-accent bg-accent-soft'
                : 'border-border bg-surface-2 hover:border-accent'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${active ? 'bg-accent' : 'bg-muted'}`} />
          </button>
        );
      })}
    </div>
  );
}

/** 16:9 preview of media placeholder with current position/size/margin. */
export function LayoutPreview({
  position,
  size,
  margin,
  label,
}: {
  position: OverlayPosition;
  size: number;
  margin: number;
  label: string;
}) {
  const { t } = useI18n();
  const { justify, align } = positionToFlex(position);
  return (
    <div>
      <span className="text-sm text-muted">{t('dash.preview')}</span>
      <div
        className="mt-1 flex aspect-[16/9] w-full overflow-hidden border border-border bg-surface-2"
        style={{ justifyContent: justify, alignItems: align }}
      >
        <div
          className="flex shrink-0 items-center justify-center border border-accent bg-accent-soft text-[10px] text-accent"
          style={{
            width: `${size}%`,
            height: `${size}%`,
            marginInline: `${margin}%`,
            marginBlock: `${(margin * 9) / 16}%`,
          }}
        >
          {label}
        </div>
      </div>
    </div>
  );
}
