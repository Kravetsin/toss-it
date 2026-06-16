export function ProgressBar({ value }: { value: number | null }) {
  return (
    <div className="h-3 w-full overflow-hidden rounded-none border-2 border-line bg-surface-2">
      {value === null ? (
        <div className="progress-indeterminate h-full w-1/3 bg-twitch-light" />
      ) : (
        <div
          className="h-full bg-twitch transition-[width] duration-200 [box-shadow:inset_-2px_0_0_var(--color-twitch-dark)]"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      )}
    </div>
  );
}
