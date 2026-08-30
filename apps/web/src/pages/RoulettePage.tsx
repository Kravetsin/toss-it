import { useCallback, useEffect, useRef, useState } from 'react';
import { PAYOUT, type RouletteColor } from '@tmw/shared';
import { fetchRouletteState, spin, type RouletteState, type SpinDone } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { useToast } from '@/providers/ToastProvider';
import { Button, Input, Loader, PageShell } from '@/ui';
import { Icon } from '@/ui/icons';
import { AuthButtons } from '@/components/AuthButtons';
import { DustMark } from '@/components/DustMark';
import { burstAt, Wheel } from '@/features/roulette/components/Wheel';

const COLORS: RouletteColor[] = ['red', 'black', 'green'];

const SWATCH: Record<RouletteColor, string> = {
  red: 'bg-[#c0392f]',
  black: 'bg-[#12171d] border border-white/15',
  green: 'bg-accent',
};

export function RoulettePage() {
  const { t } = useI18n();
  const toast = useToast();
  const { me, loading } = useMe();
  const [state, setState] = useState<RouletteState | null>(null);
  const [stake, setStake] = useState('');
  const [color, setColor] = useState<RouletteColor>('red');
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinDone | null>(null);
  /** The slot the reel is travelling to; separate from `result`, which appears only once it lands. */
  const [target, setTarget] = useState<number | null>(null);
  /** Held while the wheel is still turning; revealed by onSettled, never before. */
  const pending = useRef<SpinDone | null>(null);
  const wheelBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!me?.user) return;
    fetchRouletteState()
      .then(setState)
      .catch(() => undefined);
  }, [me?.user]);

  const play = useCallback(async () => {
    if (!state || spinning) return;
    const amount = Number.parseInt(stake, 10);
    if (!Number.isFinite(amount) || amount <= 0) return;

    setResult(null);
    let res;
    try {
      res = await spin(amount, color);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'danger');
      return;
    }
    if (!res.ok) {
      const o = res.outcome;
      const message =
        o.kind === 'cooldown'
          ? t('roulette.wait', { n: o.waitS })
          : o.kind === 'tooSmall'
            ? t('roulette.min', { n: o.min })
            : o.kind === 'overCap'
              ? t('roulette.max', { n: o.max })
              : t('roulette.broke');
      toast(message, 'warn');
      if ('balance' in o) setState({ ...state, balance: o.balance });
      return;
    }

    // The wheel is told where to stop before it starts moving: the server already decided, and
    // the animation is only allowed to agree with it.
    pending.current = res.outcome;
    setSpinning(true);
    setTarget(res.outcome.slot);
  }, [color, spinning, stake, state, t, toast]);

  // The verdict, the balance and the burst all wait for the pointer to actually stop — announcing a
  // win while the wheel is still turning gives the result away and wastes the suspense we just paid
  // a second for.
  const settle = useCallback(() => {
    const done = pending.current;
    if (!done) return;
    pending.current = null;
    setSpinning(false);
    setResult(done);
    setState((s) => (s ? { ...s, balance: done.balance } : s));
    burstAt(wheelBox.current, done.stake > 0 ? done.payout / done.stake : 0);
  }, []);

  if (loading) {
    return (
      <PageShell>
        <Loader label={t('common.loading')} />
      </PageShell>
    );
  }

  if (!me?.user) {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <h1 className="hero-title">{t('roulette.title')}</h1>
          <p className="max-w-md text-balance text-muted">{t('roulette.tagline')}</p>
          <AuthButtons returnTo="/roulette" dustHint />
        </div>
      </PageShell>
    );
  }

  const max = state?.max ?? 0;
  const won = result !== null && result.payout > 0;

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 py-8">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="hero-title">{t('roulette.title')}</h1>
          <span className="flex items-center gap-1.5 text-lg">
            <DustMark />
            {state?.balance ?? 0}
          </span>
        </div>

        <div ref={wheelBox}>
          <Wheel slot={target} spinning={spinning} onSettled={settle} />
        </div>

        {/* The verdict lives under the wheel rather than replacing it: the rim is still showing
            where the pointer stopped, and the line says what that meant. */}
        <div className="min-h-10 text-center">
          {result && (
            <p className={`text-lg ${won ? 'text-accent' : 'text-muted'}`}>
              {t(`roulette.color.${result.resultColor}`)}
              {' · '}
              <span className="font-mono font-bold">
                {won ? `+${result.payout - result.stake}` : `−${result.stake}`}
              </span>{' '}
              <DustMark />
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={spinning}
              onClick={() => setColor(c)}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius)] px-4 py-3 transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                color === c ? 'ring-2 ring-accent' : 'ring-1 ring-white/10 hover:ring-white/25'
              }`}
            >
              <span className={`size-4 rounded-full ${SWATCH[c]}`} />
              <span className="label-mono">{t(`roulette.color.${c}`)}</span>
              <span className="text-faint">×{PAYOUT[c]}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder={t('roulette.stake', { n: max })}
            disabled={spinning || max === 0}
          />
          <Button
            onClick={() => setStake(String(max))}
            disabled={spinning || max === 0}
            className="shrink-0"
          >
            {t('roulette.allIn')}
          </Button>
          <Button
            variant="accent"
            onClick={play}
            disabled={spinning || max === 0}
            className="shrink-0"
          >
            <Icon name="sparkles" size={16} />
            {t('roulette.spin')}
          </Button>
        </div>

        <p className="text-center text-xs text-faint">
          {max === 0 ? t('roulette.broke') : t('roulette.capNote', { n: max })}
        </p>

        {/* Published before it is used, so any spin it produced can be checked once the seed is
            revealed. It is here rather than buried because being able to point at it is the entire
            value — an unverifiable wheel is one accusation away from being unusable. */}
        {state && (
          <p className="break-all text-center font-mono text-[10px] text-faint/70">
            {t('roulette.fair')}: {state.fairHash}
          </p>
        )}
      </div>
    </PageShell>
  );
}
