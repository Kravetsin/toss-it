import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  accent = false,
}: {
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section
      className={`rounded-none border-2 border-line bg-surface p-4 ${accent ? 'card-pixel-accent' : 'card-pixel'} ${className}`}
    >
      {children}
    </section>
  );
}
