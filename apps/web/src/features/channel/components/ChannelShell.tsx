import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageShell } from '@/ui';

/** Каркас страницы зрителя: бренд-ссылка на главную + футер. */
export function ChannelShell({ children }: { children: ReactNode }) {
  return (
    <PageShell maxWidth="xl">
      {/* Бренд-ссылка на главную: зритель может уйти к себе — залогиниться и создать свой канал. */}
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-muted transition-colors hover:text-text"
      >
        <img src="/favicon.svg" alt="Tossit" width={24} height={24} />
        <span className="font-display text-sm uppercase tracking-wide">Tossit</span>
      </Link>
      {children}
      <p className="mt-10 text-center text-xs text-muted/60">Tossit</p>
    </PageShell>
  );
}
