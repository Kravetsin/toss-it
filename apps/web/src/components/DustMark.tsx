/** Stardust icon: constellation of star fragments (1 large, 2 small) from StarMark design. Uses currentColor. */
const SPARK =
  'M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z';

export function DustMark({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
    >
      <g transform="translate(3.5 5) scale(0.6)">
        <path d={SPARK} />
      </g>
      <g transform="translate(15.5 0.5) scale(0.32)">
        <path d={SPARK} />
      </g>
      <g transform="translate(1 14.5) scale(0.24)">
        <path d={SPARK} />
      </g>
    </svg>
  );
}
