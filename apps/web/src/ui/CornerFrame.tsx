import type { CSSProperties, ReactNode } from 'react';

/**
 * Brand corner brackets. All motion lives in CSS utilities
 * `.cornerframe`/`.cornerframe-fill` (apps/web/src/index.css).
 */
export function CornerFrame({
  tone = 'default',
  active = false,
  fill = false,
  className = '',
  children,
}: {
  tone?: 'default' | 'accent' | 'muted';
  /** Force the extended/active state without hover. */
  active?: boolean;
  /** Enable diagonal fill on hover. */
  fill?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const color =
    tone === 'accent' ? 'var(--color-accent)' : tone === 'muted' ? 'var(--color-muted)' : undefined;
  const style = color ? ({ '--cf-color': color } as CSSProperties) : undefined;
  return (
    <div
      data-active={active ? 'true' : undefined}
      style={style}
      className={`cornerframe ${fill ? 'cornerframe-fill' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
