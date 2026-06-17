import type { ButtonHTMLAttributes, CSSProperties } from 'react';

type ButtonVariant = 'primary' | 'framed' | 'accent' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-[10px] gap-1.5',
  md: 'px-5 py-3.5 gap-2',
  lg: 'min-h-[50px] px-[26px] py-4 gap-2',
};

interface VariantSpec {
  /** классы на самой кнопке */
  cls: string;
  corners: boolean;
  fill: boolean;
  /** цвет уголков (--cf-color) */
  cf?: string;
  /** цвет лейбла в покое и при ховере (когда заливка накрывает) */
  label: string;
}

const VARIANTS: Record<ButtonVariant, VariantSpec> = {
  // Тёмная штриховка + уголки + диагональная заливка (геро-CTA motion.dev).
  primary: {
    cls: 'hatch-strong bg-transparent',
    corners: true,
    fill: true,
    label: 'text-text group-hover:text-bg group-focus-visible:text-bg',
  },
  // То же, но штриховка слабее (10%).
  framed: {
    cls: 'hatch bg-transparent',
    corners: true,
    fill: true,
    label: 'text-text group-hover:text-bg group-focus-visible:text-bg',
  },
  // Сплошной акцентный CTA (фон непрозрачный → заливка-вытирание не нужна, только уголки).
  accent: {
    cls: 'bg-accent',
    corners: true,
    fill: false,
    cf: 'var(--color-accent)',
    label: 'text-accent-contrast',
  },
  danger: {
    cls: 'bg-danger',
    corners: true,
    fill: false,
    cf: 'var(--color-danger)',
    label: 'text-danger-contrast',
  },
  // Тихая обводка с уголками (без заливки).
  secondary: {
    cls: 'bg-transparent',
    corners: true,
    fill: false,
    cf: 'var(--color-muted)',
    label: 'text-text',
  },
  // Только текст.
  ghost: {
    cls: 'bg-transparent hover:opacity-80',
    corners: false,
    fill: false,
    label: 'text-muted',
  },
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  const v = VARIANTS[variant];
  const cf = v.corners ? `cornerframe ${v.fill ? 'cornerframe-fill' : ''}` : '';
  const style: CSSProperties = {};
  if (v.cf) (style as Record<string, string>)['--cf-color'] = v.cf;
  return (
    <button
      style={style}
      className={`group inline-flex cursor-pointer select-none items-center justify-center rounded-none border-0 label-mono outline-none transition-[opacity] duration-200 ease-out focus-visible:[box-shadow:var(--shadow-focus)] disabled:pointer-events-none disabled:opacity-40 ${SIZE[size]} ${cf} ${v.cls} ${className}`}
      {...rest}
    >
      <span
        className={`relative z-[1] inline-flex items-center gap-2 transition-colors duration-200 [transition-delay:120ms] ${v.label}`}
      >
        {children}
      </span>
    </button>
  );
}
