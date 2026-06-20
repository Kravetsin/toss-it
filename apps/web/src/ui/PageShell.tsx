import type { ReactNode } from 'react';

// Full class literals required for Tailwind JIT to emit (avoids interpolation issues).
const WIDTHS = {
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
} as const;

export function PageShell({
  children,
  maxWidth = 'xl',
  className = '',
}: {
  children: ReactNode;
  maxWidth?: keyof typeof WIDTHS;
  className?: string;
}) {
  return (
    <main
      className={`mx-auto min-h-screen bg-bg px-4 py-10 text-text ${WIDTHS[maxWidth]} ${className}`}
    >
      {children}
    </main>
  );
}
