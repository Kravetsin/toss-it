import type { ReactNode } from 'react';

/** Небольшой бейдж-чип (напр. статус «Первопроходец»). Цвет — брендовый cyan. */
export function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-twitch/50 bg-twitch/15 px-2 py-0.5 font-body text-xs font-semibold uppercase tracking-wide text-twitch-light ${className}`}
    >
      {children}
    </span>
  );
}
