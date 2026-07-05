import type { CardEffectModule } from '../types';

/**
 * Mint meteors raining diagonally down to the bottom edge, each flaring in a line of light exactly
 * where it exits. Meteors share one fixed direction; the sideways travel scales with the card
 * height via container-query units (27.4cqh = tan(14°) × the 110% vertical run) so the path is
 * exactly -14° — the bar's rotation — in ANY card height; a px fallback keeps old engines close.
 * They fall to `top: 100%` so the impact glow (a `g` element at the exit column, positioned by the
 * same math off --x and synced via --dur/--delay) lands on the meteor. The `.compact` variant is
 * near-straight for short rows and drops the glows.
 */
export const cardStardust: CardEffectModule = {
  id: 'card-stardust',
  type: 'card_effect',
  costDust: 3500,
  className: 'card-fx-stardust',
  counts: { web: 7, overlayCard: 10, overlayChat: 6 },
  labels: { name: 'shop.cardStardust', desc: 'shop.cardStardustDesc' },
  particle: (rnd) => {
    const dur = rnd(1.8, 3.0);
    return {
      left: `${rnd(-8, 94).toFixed(1)}%`,
      height: `${rnd(16, 28).toFixed(0)}px`,
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
    };
  },
  // Impact glow at the meteor's exit column: spawn x goes in --x; the css adds the same
  // height-proportional sideways travel as the fall so the glow sits under the landing tip.
  groundGlow: (p) => ({
    '--x': p.left ?? '50%',
    '--dur': p['--dur'] ?? '2.6s',
    '--delay': p['--delay'] ?? '0s',
  }),
  css: `
/* Size container so children can use cqh (1% of layer height) for height-proportional travel. */
.card-fx-stardust {
  container-type: size;
}
.card-fx-stardust .p {
  width: 2px;
  height: 20px;
  border-radius: 2px;
  background: linear-gradient(to bottom, transparent, var(--color-accent, #8df0cc));
  filter: drop-shadow(0 0 3px var(--color-accent, #8df0cc));
  animation: cardfx-fall var(--dur, 2.6s) linear var(--delay, 0s) infinite;
}
/* Duplicated transform lines = px fallback for engines without container-query units. */
@keyframes cardfx-fall {
  0% {
    top: -10%;
    opacity: 0;
    transform: translateX(0) rotate(-14deg);
  }
  15% {
    opacity: 0.9;
  }
  88% {
    opacity: 0.9;
  }
  100% {
    top: 100%;
    opacity: 0;
    transform: translateX(45px) rotate(-14deg);
    transform: translateX(27.4cqh) rotate(-14deg);
  }
}
.card-fx-stardust.compact .p {
  animation-name: cardfx-fall-compact;
}
@keyframes cardfx-fall-compact {
  0% {
    top: -75%;
    opacity: 0;
    transform: translateX(0) rotate(-14deg);
  }
  22% {
    opacity: 0.9;
  }
  78% {
    opacity: 0.9;
  }
  100% {
    top: 140%;
    opacity: 0;
    transform: translateX(22px) rotate(-14deg);
    transform: translateX(53.6cqh) rotate(-14deg);
  }
}
.card-fx-stardust .g {
  left: calc(var(--x, 50%) + 45px);
  left: calc(var(--x, 50%) + 27.4cqh);
  width: 22px;
  height: 2px;
  margin-left: -11px;
  border-radius: 2px;
  background: linear-gradient(to right, transparent, var(--color-accent, #8df0cc), transparent);
  box-shadow: 0 0 7px var(--color-accent, #8df0cc);
  animation: cardfx-star-impact var(--dur, 2.6s) ease-out var(--delay, 0s) infinite;
}
@keyframes cardfx-star-impact {
  0%,
  84% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  93% {
    opacity: 0.7;
    transform: scaleX(1);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.5);
  }
}
/* Compact rows: the meteor crosses the row bottom at 81.4% of the timeline ((100+75)/215), with
   81.4% of its 53.6cqh sideways travel done — the glow sits and fires exactly there. */
.card-fx-stardust.compact .g {
  left: calc(var(--x, 50%) + 18px);
  left: calc(var(--x, 50%) + 43.6cqh);
  animation-name: cardfx-star-impact-compact;
}
@keyframes cardfx-star-impact-compact {
  0%,
  73% {
    opacity: 0;
    transform: scaleX(0.4);
  }
  82% {
    opacity: 0.7;
    transform: scaleX(1);
  }
  91% {
    opacity: 0;
    transform: scaleX(1.5);
  }
  100% {
    opacity: 0;
    transform: scaleX(1.5);
  }
}
`,
};
