// The site's own 4-point stardust spark (same path as DustMark / the Sealed-star cosmetic).
const SPARK =
  'M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z';

/**
 * Brand emblem: the spark sealed in a ring — the "Sealed star" cosmetic, fixed as the logo. Mint
 * spark on a dark disc; the spark and ring track the accent token, the disc stays dark so the spark
 * always pops. Mirrors apps/../cosmetics/effects/seal-star.ts (lit rung) — keep them visually aligned.
 */
export function BrandSeal({ size = 80, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label="Tossit"
      className={`shrink-0 ${className}`}
    >
      <circle
        cx="12"
        cy="12"
        r="10.6"
        fill="#0c1a15"
        stroke="var(--color-accent)"
        strokeWidth="1.3"
      />
      <g transform="translate(2.4 2.4) scale(0.8)">
        <path d={SPARK} fill="var(--color-accent)" />
      </g>
    </svg>
  );
}
