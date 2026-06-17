import type { ReactNode } from 'react';

/** Небольшой бейдж-чип (напр. статус «Первопроходец»). Круглая семья, акцентный. */
export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 label-mono text-accent ${className}`}
    >
      {children}
    </span>
  );
}
