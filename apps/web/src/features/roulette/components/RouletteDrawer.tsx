import { useCallback, useEffect, useRef, useState } from 'react';
import { BET, type RouletteColor } from '@tmw/shared';
import { fetchRouletteState, spin, type RouletteState, type SpinDone } from '@/lib/api';
import { useI18n } from '@/i18n';
import { useToast } from '@/providers/ToastProvider';
import { DustMark } from '@/components/DustMark';
import { AmountDial } from './AmountDial';
import { BetChips } from './BetChips';
import { burstAt, overBand, Wheel } from './Wheel';

/**
 * The wheel as a drawer that rises from the bottom, where the ARC ITSELF is the boundary — there is
 * no panel behind it. Outside the disc the page shows through; inside it sits everything the player
 * needs, which is three tiles and a stake.
 *
 * Height is the disc's cap plus room for the controls under it. Wider than the arc is tall on
 * purpose: this is the top of something big, not a dial in a box.
 */
const HEIGHT = 330;

export function RouletteDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [state, setState] = useState<RouletteState | null>(null);
  const [stake, setStake] = useState<number>(BET.min);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinDone | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  /** Outcome of the spin in flight, for the wheel's landing wash. Set with the target, not on
   *  settle: the wash has to be ready the instant the pointer stops. */
  const [wonPending, setWonPending] = useState<boolean | null>(null);
  /** Held over the wheel right now — lights the window's frame in its colour. */
  const [armed, setArmed] = useState<RouletteColor | null>(null);
  /** Out on the wheel until it stops; the tray keeps its socket empty that whole time. */
  const [away, setAway] = useState<RouletteColor | null>(null);
  const pending = useRef<SpinDone | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open) return;
    fetchRouletteState()
      .then((s) => {
        setState(s);
        setStake((v) => Math.min(Math.max(v, s.min), Math.max(s.min, s.max)));
      })
      .catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !spinning) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, spinning, onClose]);

  const hitTest = useCallback((x: number, y: number) => overBand(canvasRef.current, x, y), []);

  const play = useCallback(
    async (color: RouletteColor) => {
      if (!state || spinning || state.max === 0) return;
      setResult(null);
      setAway(color);
      let res;
      try {
        res = await spin(stake, color);
      } catch (e) {
        setAway(null);
        toast(e instanceof Error ? e.message : String(e), 'danger');
        return;
      }
      if (!res.ok) {
        setAway(null);
        // A refusal has to say something: a tile that flies back with no explanation reads as the
        // drawer being broken, and the commonest refusal is a cooldown the player cannot see.
        const o = res.outcome;
        toast(
          o.kind === 'cooldown'
            ? t('roulette.wait', { n: o.waitS })
            : o.kind === 'tooSmall'
              ? t('roulette.min', { n: o.min })
              : o.kind === 'overCap'
                ? t('roulette.max', { n: o.max })
                : t('roulette.broke'),
          'warn',
        );
        if ('balance' in o) setState({ ...state, balance: o.balance });
        return;
      }
      // The wheel is told where to stop before anything moves: the server already decided, and the
      // animation is only allowed to agree with it.
      pending.current = res.outcome;
      setWonPending(res.outcome.payout > 0);
      setSpinning(true);
      setTarget(res.outcome.slot);
    },
    [spinning, stake, state, t, toast],
  );

  // Verdict, balance, burst and the tile's return all wait for the wheel to actually stop.
  const settle = useCallback(() => {
    const done = pending.current;
    if (!done) return;
    pending.current = null;
    setSpinning(false);
    setAway(null);
    setResult(done);
    setState((s) => (s ? { ...s, balance: done.balance } : s));
    burstAt(canvasRef.current, done.stake > 0 ? done.payout / done.stake : 0);
  }, []);

  const max = state?.max ?? 0;
  const won = result !== null && result.payout > 0;

  return (
    <>
      {/* Invisible, because the arc is the only chrome this thing gets — but a click outside still
          has to close it, and while the wheel is turning nothing outside may steal the pointer. */}
      {open && (
        <div
          className="fixed inset-0 z-40"
          onPointerDown={() => !spinning && onClose()}
          aria-hidden="true"
        />
      )}

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('roulette.title')}
        className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-500 ease-out ${
          open ? 'translate-y-0' : 'pointer-events-none translate-y-full'
        }`}
        style={{ height: HEIGHT }}
      >
        {/* The disc: band, glass and the body under it, all one canvas. Nothing outside the circle
            is painted, so the page keeps showing through the corners. */}
        <Wheel
          slot={target}
          spinning={spinning}
          armed={armed}
          won={wonPending}
          interior
          canvasRef={canvasRef}
          className="absolute inset-0 block size-full"
          onSettled={settle}
        />

        {/* Controls live inside the arc. Narrow column so they stay clear of the curve on any width. */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-5 pt-2">
          <div className="w-full max-w-[360px]">
            <AmountDial
              value={stake}
              max={max}
              disabled={spinning || max === 0}
              onChange={setStake}
            />
          </div>

          <BetChips
            disabled={spinning || max === 0}
            away={away}
            hitTest={hitTest}
            onArm={setArmed}
            onPlay={play}
          />

          {/* Under the tray, never over the wheel: the wheel is the one thing being watched, and a
              caption across it covers exactly the pockets the player is trying to read. */}
          <div className="flex h-8 items-center">
            {result ? (
              <span
                className={`text-xl font-bold tabular-nums ${won ? 'text-accent' : 'text-danger'}`}
              >
                {won ? `+${result.payout - result.stake}` : `−${result.stake}`}
                <span className="ml-1.5 text-sm font-normal opacity-70">
                  {t(`roulette.color.${result.resultColor}`)}
                </span>
              </span>
            ) : (
              <span className="text-xs text-faint">
                {max === 0 ? t('roulette.broke') : t('roulette.throwHint')}
              </span>
            )}
          </div>

          {/* Rates live here rather than on the tiles: the tiles are the verb, and a verb with a
              number printed on it stops reading as a thing you can pick up. */}
          <span className="flex items-center gap-3 text-xs text-faint">
            <span>{t('roulette.odds')}</span>
            <span className="flex items-center gap-1 text-muted">
              <DustMark />
              {state?.balance ?? 0}
            </span>
          </span>

          {/* The seed's hash, published before it is used. Small, but present: being able to point
              at it is the entire value, and a wheel nobody can check is one accusation from dead. */}
          {state && (
            <span
              title={state.fairHash}
              className="max-w-full truncate font-mono text-[10px] text-faint/50"
            >
              {t('roulette.fair')}: {state.fairHash.slice(0, 16)}…
            </span>
          )}
        </div>
      </div>
    </>
  );
}
