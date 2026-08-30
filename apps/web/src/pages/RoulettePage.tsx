import { useCallback, useEffect, useRef, useState } from 'react';
import { BET, type RouletteColor } from '@tmw/shared';
import { fetchRouletteState, spin, type RouletteState, type SpinDone } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useMe } from '@/hooks/useMe';
import { useToast } from '@/providers/ToastProvider';
import { Loader, PageShell } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { DustMark } from '@/components/DustMark';
import { AmountDial } from '@/features/roulette/components/AmountDial';
import { BetChips } from '@/features/roulette/components/BetChips';
import { burstAt, Wheel } from '@/features/roulette/components/Wheel';

export function RoulettePage() {
  const { t } = useI18n();
  const toast = useToast();
  const { me, loading } = useMe();
  const [state, setState] = useState<RouletteState | null>(null);
  // Annotated: BET.min is a literal const, so an inferred state would be typed `10` forever.
  const [stake, setStake] = useState<number>(BET.min);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinDone | null>(null);
  /** The pocket the wheel is travelling to; separate from `result`, which appears only on landing. */
  const [target, setTarget] = useState<number | null>(null);
  /** Colour held over the wheel right now — lights the window frame in it. */
  const [armed, setArmed] = useState<RouletteColor | null>(null);
  /** Held while the wheel turns; revealed by onSettled, never before. */
  const pending = useRef<SpinDone | null>(null);
  const wheelBox = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!me?.user) return;
    fetchRouletteState()
      .then((s) => {
        setState(s);
        setStake((v) => Math.min(Math.max(v, s.min), Math.max(s.min, s.max)));
      })
      .catch(() => undefined);
  }, [me?.user]);

  const play = useCallback(
    async (color: RouletteColor) => {
      if (!state || spinning || state.max === 0) return;
      setResult(null);
      let res;
      try {
        res = await spin(stake, color);
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

      // The wheel is told where to stop before anything moves: the server already decided, and the
      // animation is only allowed to agree with it.
      pending.current = res.outcome;
      setSpinning(true);
      setTarget(res.outcome.slot);
    },
    [spinning, stake, state, t, toast],
  );

  // Verdict, balance and burst all wait for the wheel to actually stop — announcing a win while it
  // is still turning gives the answer away and wastes the second of suspense we just paid for.
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
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-8">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="hero-title">{t('roulette.title')}</h1>
          <span className="flex items-center gap-1.5 text-lg">
            <DustMark />
            {state?.balance ?? 0}
          </span>
        </div>

        <div
          ref={wheelBox}
          className="overflow-hidden rounded-[var(--radius)] border border-white/10 bg-black/40"
        >
          <Wheel slot={target} spinning={spinning} armed={armed} onSettled={settle} />
        </div>

        {/* The verdict sits under the wheel rather than replacing it: the window is still showing
            where the pointer stopped, and this line says what that meant. */}
        <div className="min-h-7 text-center">
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

        <div className="rounded-[var(--radius)] border border-white/10 bg-black/30">
          <AmountDial
            value={stake}
            max={max}
            disabled={spinning || max === 0}
            onChange={setStake}
          />
        </div>

        <BetChips
          disabled={spinning || max === 0}
          dropRef={wheelBox}
          onArm={setArmed}
          onPlay={play}
        />

        <p className="text-center text-xs text-faint">
          {max === 0 ? t('roulette.broke') : t('roulette.throwHint', { n: max })}
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
