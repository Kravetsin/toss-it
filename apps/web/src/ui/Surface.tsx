import type { HTMLAttributes, ReactNode } from 'react';

/** Glass surface for floating panels/badges over media; not for long text. */
export function Surface({
  variant = 'glass',
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  variant?: 'glass' | 'glass-strong' | 'glass-badge';
  children: ReactNode;
}) {
  const v = variant === 'glass-strong' ? 'glass glass-strong' : variant;
  return (
    <div className={`${v} ${className}`} {...rest}>
      {children}
    </div>
  );
}
