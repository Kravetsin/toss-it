import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageShell } from '@/ui';
import { BackgroundStars } from '@/components/BackgroundStars';
import { StardustWallet } from '@/components/StardustWallet';

/** Каркас страницы зрителя: бренд-ссылка на главную + футер + фоновые звёзды. */
export function ChannelShell({ children }: { children: ReactNode }) {
  return (
    <PageShell maxWidth="xl">
      <BackgroundStars />
      <div className="relative z-10">
        {/* Бренд-ссылка на главную + кошелёк звёздной пыли зрителя. */}
        <div className="mb-6 flex items-center justify-between gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-muted transition-colors hover:text-text"
          >
            <img src="/favicon.svg" alt="Tossit" width={24} height={24} />
            <span className="label-mono">Tossit</span>
          </Link>
          <StardustWallet />
        </div>
        {children}
        <p className="mt-10 text-center label-mono text-faint">Tossit</p>
      </div>
    </PageShell>
  );
}
