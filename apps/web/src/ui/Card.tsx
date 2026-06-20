import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  accent = false,
  corners = false,
}: {
  children: ReactNode;
  className?: string;
  /** Top accent edge (for the screen's main card). */
  accent?: boolean;
  /** Decorative corner brackets around the perimeter (no fill). */
  corners?: boolean;
}) {
  const shadow = accent
    ? '[box-shadow:inset_0_1px_0_0_var(--color-accent),var(--shadow-2)]'
    : 'shadow-2';
  return (
    <section
      className={`relative rounded-none border border-border bg-surface p-4 ${shadow} ${
        corners ? 'cornerframe' : ''
      } ${className}`}
    >
      {children}
    </section>
  );
}
