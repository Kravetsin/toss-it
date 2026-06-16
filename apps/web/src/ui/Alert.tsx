import type { ReactNode } from 'react';

export function Alert({ tone, children }: { tone: 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  const tones = {
    ok: 'border-ok text-ok bg-[color-mix(in_srgb,var(--color-ok)_12%,var(--color-surface))]',
    warn: 'border-warn text-warn bg-[color-mix(in_srgb,var(--color-warn)_12%,var(--color-surface))]',
    danger: 'border-danger text-danger bg-[color-mix(in_srgb,var(--color-danger)_14%,var(--color-surface))]',
  };
  return (
    <div className={`flex items-center gap-2 rounded-none border-2 border-l-4 px-3 py-2 ${tones[tone]}`}>
      {children}
    </div>
  );
}
