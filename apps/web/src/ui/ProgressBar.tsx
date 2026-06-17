export function ProgressBar({ value }: { value: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-surface-2">
      {value === null ? (
        <div className="progress-indeterminate h-full w-1/3 rounded-full bg-accent" />
      ) : (
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-[var(--dur)] ease-out"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      )}
    </div>
  );
}
