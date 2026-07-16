import { type ButtonHTMLAttributes, type CSSProperties } from 'react';
import { useFillEffect } from '@/ui/useFillEffect';

type ButtonVariant = 'primary' | 'framed' | 'accent' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-2 text-[10px] gap-1.5',
  md: 'px-5 py-3.5 gap-2',
  lg: 'min-h-[50px] px-[26px] py-4 gap-2',
};

interface VariantSpec {
  cls: string;
  corners: boolean;
  /**
   * Circular fill color. undefined → bg-text + mix-blend-difference label
   * (inverts; for transparent bg). string → custom color, no blend (opaque/quiet bg).
   */
  fillColor?: string;
  /** corner color (--cf-color) */
  cf?: string;
  label?: string;
}

const VARIANTS: Record<ButtonVariant, VariantSpec> = {
  primary: { cls: 'hatch-strong bg-transparent', corners: true },
  framed: { cls: 'hatch bg-transparent', corners: true },
  accent: {
    cls: 'bg-accent',
    corners: true,
    fillColor: 'rgba(255,255,255,0.25)',
    cf: 'var(--color-accent)',
    label: 'text-accent-contrast',
  },
  danger: {
    cls: 'bg-danger',
    corners: true,
    fillColor: 'rgba(255,255,255,0.25)',
    cf: 'var(--color-danger)',
    label: 'text-danger-contrast',
  },
  secondary: {
    cls: 'bg-transparent',
    corners: true,
    fillColor: 'rgba(255,255,255,0.10)',
    cf: 'var(--color-muted)',
    label: 'text-text',
  },
  ghost: {
    cls: 'bg-transparent',
    corners: false,
    fillColor: 'rgba(255,255,255,0.07)',
    label: 'text-muted',
  },
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  style: restStyle,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  const v = VARIANTS[variant];
  const { fillRef, handlers: fillHandlers } = useFillEffect();

  const style: CSSProperties = { ...restStyle };
  if (v.cf) (style as Record<string, string>)['--cf-color'] = v.cf;

  // `relative` is load-bearing: the fill span is `absolute inset-0`, and only `.cornerframe` used to
  // position the button — so cornerless variants (ghost) leaked their fill up to the nearest
  // positioned ancestor and washed the whole card on hover.
  return (
    <button
      style={style}
      className={`group relative inline-flex cursor-pointer select-none items-center justify-center rounded-none border-0 label-mono outline-none transition-[opacity] duration-200 ease-out focus-visible:[box-shadow:var(--shadow-focus)] disabled:pointer-events-none disabled:opacity-40 ${SIZE[size]} ${v.corners ? 'cornerframe' : ''} ${v.cls} ${className}`}
      {...rest}
      {...fillHandlers}
    >
      <span
        ref={fillRef}
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-0 ${v.fillColor ? '' : 'bg-text'}`}
        style={{
          clipPath: 'circle(0% at 50% 50%)',
          ...(v.fillColor ? { backgroundColor: v.fillColor } : {}),
        }}
      />
      <span
        className={`relative z-[1] inline-flex items-center gap-2 ${v.label ?? ''}`}
        style={!v.fillColor ? { color: '#fff', mixBlendMode: 'difference' } : undefined}
      >
        {children}
      </span>
    </button>
  );
}
