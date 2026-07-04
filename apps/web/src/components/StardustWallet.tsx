import { useEffect, useRef, useState } from 'react';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { Tooltip } from '@/ui';
import { DustMark } from '@/components/DustMark';
import { CosmeticsDrawer } from '@/components/CosmeticsDrawer';
import { registerStardustWallet } from '@/lib/stardustFx';

/**
 * Stardust wallet chip; click opens the cosmetics shop. Registers as flyStardust target.
 * Source of truth is me.user.stardust; follows it both ways (purchases decrease it).
 */
export function StardustWallet({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const { me } = useMe();
  const base = me?.user?.stardust ?? 0;
  const ref = useRef<HTMLButtonElement>(null);
  const [displayed, setDisplayed] = useState(base);
  const [pop, setPop] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);

  useEffect(() => {
    setDisplayed(base);
  }, [base]);

  useEffect(() => {
    if (!me?.user) return;
    registerStardustWallet({
      rect: () => ref.current?.getBoundingClientRect() ?? null,
      // Only trigger the pop; the number follows `base` (refresh fires on send), so we never
      // show a stale-high value when a purchase lowered the balance mid earn-animation.
      bump: () => {
        setPop(true);
        window.setTimeout(() => setPop(false), 400);
      },
    });
    return () => registerStardustWallet(null);
  }, [me?.user]);

  if (!me?.user) return null;
  return (
    <>
      <Tooltip
        align="end"
        className={className}
        content={
          <span className="flex flex-col gap-1">
            <span className="flex items-center gap-1.5 font-semibold text-text">
              <DustMark size={13} className="text-accent" />
              {t('wallet.stardust')}
            </span>
            <span>{t('wallet.about')}</span>
            <span className="mt-0.5 text-faint">{t('wallet.howTitle')}</span>
            <span className="text-faint">{t('wallet.earnPost')}</span>
            <span className="text-faint">{t('wallet.earnChat')}</span>
            <span className="text-faint">{t('wallet.earnDonate')}</span>
          </span>
        }
      >
        <button
          ref={ref}
          type="button"
          onClick={() => setShopOpen(true)}
          aria-label={t('shop.open')}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm text-muted outline-none transition-colors hover:border-accent hover:text-text focus-visible:[box-shadow:var(--shadow-focus)]"
        >
          <DustMark size={15} className="text-accent" />
          <span
            className={`tabular-nums transition-transform duration-200 ${pop ? 'scale-125 text-accent' : ''}`}
          >
            {displayed}
          </span>
        </button>
      </Tooltip>
      <CosmeticsDrawer open={shopOpen} onClose={() => setShopOpen(false)} />
    </>
  );
}
