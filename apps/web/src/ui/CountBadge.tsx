/**
 * Unread counter with the attention ring the shop's "new" mark uses — same spreading pulse, but
 * carrying a number. Renders nothing at zero, so callers can hand it a raw count.
 *
 * Purely presentational: it does NOT position itself. A trigger that wants it hanging off a corner
 * wraps it in its own absolutely-positioned span, because where the corner is depends on the
 * trigger's shape (round icon vs full-width row).
 */
export function CountBadge({
  count,
  max = 99,
  className = '',
}: {
  count: number;
  /** Anything above this shows as "{max}+" — keeps the pill from stretching the layout. */
  max?: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span aria-hidden className={`pointer-events-none relative inline-flex ${className}`}>
      <span className="absolute inset-0 rounded-full bg-accent opacity-70 motion-safe:animate-ping" />
      <span className="relative flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[0.625rem] font-bold leading-none text-accent-contrast">
        {count > max ? `${max}+` : count}
      </span>
    </span>
  );
}
