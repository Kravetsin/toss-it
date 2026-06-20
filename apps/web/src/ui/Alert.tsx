import type { ReactNode } from 'react';

export function Alert({ tone, children }: { tone: 'ok' | 'warn' | 'danger'; children: ReactNode }) {
  const tones = {
    ok: 'border-ok bg-ok-soft text-ok',
    warn: 'border-warn bg-warn-soft text-warn',
    danger: 'border-danger bg-danger-soft text-danger',
  };
  return (
    <div className={`flex items-center gap-2 rounded-none border px-3 py-2 ${tones[tone]}`}>
      {children}
    </div>
  );
}
