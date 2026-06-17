import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  accent = false,
  corners = false,
}: {
  children: ReactNode;
  className?: string;
  /** Верхняя акцентная кромка (для главной карточки экрана). */
  accent?: boolean;
  /** Декоративные уголки-скобки по периметру (без заливки). */
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
