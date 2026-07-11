import { Card, Tooltip } from '@/ui';
import { Icon, type IconName } from '@/ui/icons';

export interface BarPoint {
  /** Full label for the hover tooltip (e.g. the date). */
  label: string;
  /** Short axis label under the bar (e.g. day-of-month). */
  short: string;
  value: number;
  /** Highlighted portion of the bar (≤ value), e.g. aired within total submissions. */
  sub?: number;
}

/** Lightweight CSS bar chart (no chart lib): one bar per point, optional two-tone for a sub-series. */
export function StatBarChart({
  title,
  icon,
  points,
  formatValue = String,
  subLabel,
  total,
}: {
  title: string;
  icon: IconName;
  points: BarPoint[];
  formatValue?: (v: number) => string;
  /** Legend for the highlighted (accent) portion; enables two-tone bars. */
  subLabel?: string;
  /** Headline number shown next to the title; defaults to the sum of values. */
  total?: number;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const sum = total ?? points.reduce((s, p) => s + p.value, 0);
  // Axis labels crowd past ~16 bars — thin them out.
  const step = points.length > 16 ? Math.ceil(points.length / 8) : 1;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 label-mono text-text">
          <Icon name={icon} size={15} className="text-accent" />
          {title}
        </h3>
        <span className="tabular-nums text-sm text-text">{formatValue(sum)}</span>
      </div>

      <div className="flex h-28 items-end gap-[3px]">
        {points.map((p, i) => {
          const anyPct = (p.value / max) * 100;
          const subFrac = subLabel && p.value > 0 ? Math.min(1, (p.sub ?? 0) / p.value) : 0;
          return (
            <Tooltip
              key={i}
              focusable={false}
              placement="top"
              className="group h-full min-w-0 flex-1 flex-col justify-end"
              content={
                <span className="flex flex-col gap-0.5">
                  <span className="text-text">{p.label}</span>
                  <span>
                    {formatValue(p.value)}
                    {subLabel && p.sub != null && (
                      <span className="text-accent">
                        {' · '}
                        {formatValue(p.sub)} {subLabel}
                      </span>
                    )}
                  </span>
                </span>
              }
            >
              <div className="w-full overflow-hidden rounded-t-sm" style={{ height: `${anyPct}%` }}>
                {subLabel ? (
                  <>
                    <div
                      className="bg-surface-3/70"
                      style={{ height: `${(1 - subFrac) * 100}%` }}
                    />
                    <div className="bg-accent" style={{ height: `${subFrac * 100}%` }} />
                  </>
                ) : (
                  <div className="h-full bg-accent/80 transition-colors group-hover:bg-accent" />
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex justify-between gap-[3px]">
        {points.map((p, i) => (
          <span key={i} className="flex-1 text-center text-[0.625rem] tabular-nums text-muted">
            {i % step === 0 ? p.short : ''}
          </span>
        ))}
      </div>

      {subLabel && (
        <div className="flex items-center gap-1.5 text-[0.625rem] text-muted">
          <span className="size-2 rounded-sm bg-accent" />
          {subLabel}
        </div>
      )}
    </Card>
  );
}
