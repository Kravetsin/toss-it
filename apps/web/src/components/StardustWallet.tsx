import { useEffect, useRef, useState } from 'react';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { DustMark } from '@/components/DustMark';
import { registerStardustWallet } from '@/lib/stardustFx';

/**
 * Чип кошелька звёздной пыли (глобальный баланс залогиненного пользователя). Регистрируется
 * как мишень для анимации «осколок летит в кошелёк» (flyStardust) и делает «+1»-pop по прилёту.
 * Скрыт, если не залогинен. Источник истины — me.user.stardust; локальный displayed только
 * вперёд (Math.max), чтобы оптимистичный бамп не откатывался гонкой с refresh.
 */
export function StardustWallet({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const { me } = useMe();
  const base = me?.user?.stardust ?? 0;
  const ref = useRef<HTMLSpanElement>(null);
  const [displayed, setDisplayed] = useState(base);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    setDisplayed((d) => Math.max(d, base));
  }, [base]);

  useEffect(() => {
    if (!me?.user) return;
    registerStardustWallet({
      rect: () => ref.current?.getBoundingClientRect() ?? null,
      bump: (to) => {
        setDisplayed((d) => Math.max(d, to));
        setPop(true);
        window.setTimeout(() => setPop(false), 400);
      },
    });
    return () => registerStardustWallet(null);
  }, [me?.user]);

  if (!me?.user) return null;
  return (
    <span
      ref={ref}
      title={t('wallet.stardust')}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm text-muted ${className}`}
    >
      <DustMark size={15} className="text-accent" />
      <span
        className={`tabular-nums transition-transform duration-200 ${pop ? 'scale-125 text-accent' : ''}`}
      >
        {displayed}
      </span>
    </span>
  );
}
