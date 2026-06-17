import type { HTMLAttributes, ReactNode } from 'react';

/**
 * Стеклянная поверхность (плавающая хромированная панель/бейдж). Используется
 * дозированно — для шапки/оверлеев/бейджей над медиа, не под длинным текстом.
 */
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
