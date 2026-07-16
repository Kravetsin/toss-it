import type { ColorModule } from '../types';

/**
 * The gradient's colours drift endlessly through the name. Top of the nick-colour ladder
 * (nick-color → nick-gradient → this), so it needs both stops; it is NOT a nick_effect and does not
 * take that slot — a flowing name still gets its glow/pulse.
 *
 * Replaced an earlier rare-sweep "shimmer": on something as small and short-lived as a name (an
 * overlay alert is on screen ~6-10s) an effect that is absent most of the time reads as nothing.
 * Rare events belong on the card, which has the canvas for them.
 *
 * Seamless loop: the ramp runs c1→c2→c1 — one full period — over a layer 2x the name's width, and
 * the sweep translates by exactly that period, so the wrap is invisible. Kept slow on purpose:
 * speed is the whole line between "holographic" and "gamer RGB".
 */
export const nickFlow: ColorModule = {
  id: 'nick-flow',
  type: 'nick_color',
  // Same reasoning as the gradient below it: the whole colour ladder (colour → gradient → flow)
  // lands at 3000, roughly one card effect, because that is what it competes with for a wallet.
  costDust: 1000,
  requires: 'nick-gradient',
  className: 'nick-flow',
  animation: 'nick-flow 5s linear infinite',
  labels: { name: 'shop.nickFlow', desc: 'shop.nickFlowDesc' },
  css: `
.nick-flow {
  background-image: linear-gradient(
    90deg,
    var(--nick-c1),
    var(--nick-c2),
    var(--nick-c1)
  );
  background-size: 200% 100%;
  background-repeat: repeat-x;
}
@keyframes nick-flow {
  to {
    background-position: 200% 0;
  }
}
`,
};
