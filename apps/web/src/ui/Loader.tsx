import { Icon } from '@/ui/icons';

// Strips trailing ellipsis/spaces from label. Respects prefers-reduced-motion via animate-spin.
export function Loader({ label }: { label?: string }) {
  const word = (label ?? 'Loading').replace(/[.…\s]+$/u, '');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label ?? 'Loading'}
      className="flex min-h-[50vh] flex-col items-center justify-center gap-5"
    >
      <Icon name="loader" size={36} className="animate-spin text-accent" />
      <span aria-hidden="true" className="label-mono text-muted">
        {word}
      </span>
    </div>
  );
}
