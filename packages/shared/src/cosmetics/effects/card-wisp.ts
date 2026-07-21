import type { CardEffectModule } from '../types';

/**
 * Ghost-fire wisps drifting a slow, chaotic path through a faint enchanted haze — a lure of the
 * folklore will-o'-the-wisp: a hovering flame that wanders, flickers, and vanishes only to reappear
 * elsewhere. Several at once, at varied sizes so the swarm has depth.
 *
 * EACH WISP is three layers on one particle, and the split is deliberate:
 *  - `.p` is the ANCHOR and the only thing that MOVES. It runs one animation carrying BOTH the wander
 *    (a translate through four random waypoints and back) AND the opacity envelope. One animation,
 *    because bindRespawn (../registry.ts) fires on `.p`'s `animationiteration` and a second animation
 *    on `.p` would fire it again mid-drift — so the whole cluster's respawn stays pinned to the single
 *    opacity-0 moment. An earlier version put the wander on the PSEUDOS (to phase-shift an echo off
 *    it) and kept `.p` still; this reverses that, which frees both pseudos for real detail.
 *  - `::before` is the CORE: a hot white centre bleeding into the wisp's colour, wrapped in a soft
 *    box-shadow aura, on its own quick FLICKER (brightness + scale) like a guttering flame. It carries
 *    no translate, so it rides `.p`'s wander without compounding it.
 *  - `::after` is the FLAME TAIL — a soft colour licking UPWARD off the core (flame rises regardless of
 *    which way the wisp drifts, so an always-up tail is right, not a bug), wavering side to side on its
 *    own keyframe (skew about its base + a breathing scaleY). This replaces the old "second blurred
 *    circle trailing behind", which read as a smear; a living, wavering tongue reads as fire.
 *
 * THE HAZE fills the space between wisps so the card never looks empty. It lives on the LAYER'S OWN
 * pseudo-elements (the wisps are `.p` CHILDREN, so `.card-fx-wisp::before` / `::after` are free):
 * `::before` a few drifting fog blooms, `::after` a field of tiny floating motes (tiling gradient,
 * resolution-independent) rising and twinkling. Both very faint — atmosphere, not subject.
 *
 * No groundGlow: a wisp hovers and wanders, it never rises from or lands on the bottom edge.
 */

/** Cool spectral fire colours — will-o'-the-wisps read as pale green/teal/blue ghost-flame, never warm. */
const WISP_COLORS = ['#57e0b0', '#4fd0d8', '#78e6a0', '#6ad0e8', '#8ff0cc'];

export const cardWisp: CardEffectModule = {
  id: 'card-wisp',
  type: 'card_effect',
  costDust: 4000,
  className: 'card-fx-wisp',
  counts: { web: 6, overlayCard: 5, overlayChat: 4 },
  labels: { name: 'shop.cardWisp', desc: 'shop.cardWispDesc' },
  particle: (rnd, compact) => {
    // Size scale for depth: bigger wisps read as nearer. Core size drives the tail's proportions.
    const s = rnd(0.72, 1.3);
    const core = (compact ? 4.2 : 6) * s;
    const tailW = core * 1.35;
    const tailH = core * 3.8;
    const color = WISP_COLORS[Math.floor(rnd(0, WISP_COLORS.length - 0.0001))]!;

    // The wander: four random waypoints, returning to (0, 0) — a seamless loop, fixed px (a local
    // roam, not a card traversal; the spawn spread does the card-covering). Wider than the old effect
    // so wisps actually rove instead of hovering in one spot.
    const amp = compact ? { x: 24, y: 16 } : { x: 50, y: 36 };
    const wp = () => `${rnd(-amp.x, amp.x).toFixed(0)}px ${rnd(-amp.y, amp.y).toFixed(0)}px`;

    const dur = compact ? rnd(6, 9) : rnd(8, 12);
    return {
      left: `${rnd(8, 92).toFixed(1)}%`,
      top: `${rnd(10, 90).toFixed(1)}%`,
      '--wisp': color,
      '--core': `${core.toFixed(1)}px`,
      '--tw': `${tailW.toFixed(1)}px`,
      '--th': `${tailH.toFixed(1)}px`,
      '--w1': wp(),
      '--w2': wp(),
      '--w3': wp(),
      '--w4': wp(),
      '--dur': `${dur.toFixed(2)}s`,
      '--delay': `${(-rnd(0, dur)).toFixed(2)}s`,
      '--flicker-dur': `${rnd(0.8, 1.7).toFixed(2)}s`,
      '--waver-dur': `${rnd(1.5, 2.8).toFixed(2)}s`,
    };
  },
  // Reborn each cycle with a new colour, size, spot and wander path — all at opacity 0 (see the life
  // keyframe). Flicker/waver run on the pseudos and are left alone.
  respawnKeys: ['top', '--wisp', '--core', '--tw', '--th', '--w1', '--w2', '--w3', '--w4'],
  css: `
/* THE HAZE — atmosphere on the layer's own pseudo-elements (the wisps are .p children, so these are
   free). Faint by design: it fills the gaps between wisps, it is not the subject. */
.card-fx-wisp::before,
.card-fx-wisp::after {
  content: '';
  position: absolute;
  inset: -20%;
  pointer-events: none;
}
/* Drifting fog blooms. */
.card-fx-wisp::before {
  background:
    radial-gradient(42% 55% at 25% 40%, rgba(87, 224, 176, 0.07), transparent 70%),
    radial-gradient(46% 52% at 72% 66%, rgba(79, 208, 216, 0.06), transparent 70%),
    radial-gradient(38% 46% at 55% 18%, rgba(120, 230, 160, 0.05), transparent 70%);
  animation: cardfx-wisp-haze 24s ease-in-out infinite;
}
/* A field of tiny floating motes, tiling so it fills any surface; rises and twinkles. */
.card-fx-wisp::after {
  background-image:
    radial-gradient(1px 1px at 20px 30px, rgba(205, 255, 235, 0.7), transparent),
    radial-gradient(1px 1px at 95px 80px, rgba(160, 240, 210, 0.6), transparent),
    radial-gradient(1.3px 1.3px at 150px 45px, rgba(205, 255, 235, 0.5), transparent),
    radial-gradient(1px 1px at 60px 130px, rgba(150, 235, 225, 0.55), transparent);
  background-size: 170px 170px, 210px 210px, 140px 140px, 190px 190px;
  animation: cardfx-wisp-motes 16s ease-in-out infinite;
}
.card-fx-wisp.compact::before {
  opacity: 0.6;
}
@keyframes cardfx-wisp-haze {
  0%,
  100% {
    transform: translate(-3%, -2%) scale(1);
    opacity: 0.8;
  }
  50% {
    transform: translate(3%, 2%) scale(1.08);
    opacity: 1;
  }
}
@keyframes cardfx-wisp-motes {
  0%,
  100% {
    transform: translateY(6px);
    opacity: 0.5;
  }
  50% {
    transform: translateY(-6px);
    opacity: 0.95;
  }
}

/* THE WISP — anchor .p (moves), core ::before, flame tail ::after. */
.card-fx-wisp .p {
  top: 0;
  width: 0;
  height: 0;
  animation: cardfx-wisp-life var(--dur, 9s) ease-in-out var(--delay, 0s) infinite;
}
/* The core: hot white centre → the wisp's colour, wrapped in a soft aura (the box-shadow), on a quick
   flicker. Centred on the anchor via the negative margin. */
.card-fx-wisp .p::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: var(--core, 6px);
  height: var(--core, 6px);
  margin: calc(var(--core, 6px) / -2) 0 0 calc(var(--core, 6px) / -2);
  border-radius: 50%;
  background: radial-gradient(circle, #f4fffb 0%, var(--wisp, #57e0b0) 58%, transparent 74%);
  box-shadow:
    0 0 8px var(--wisp, #57e0b0),
    0 0 18px var(--wisp, #57e0b0),
    0 0 30px color-mix(in srgb, var(--wisp, #57e0b0) 60%, transparent);
  animation: cardfx-wisp-flicker var(--flicker-dur, 1.2s) ease-in-out infinite;
}
/* The flame tail: a soft tongue licking upward off the core, pivoting about its base (where it meets
   the core) so the waver reads as a flame bending, not sliding. */
.card-fx-wisp .p::after {
  content: '';
  position: absolute;
  left: 0;
  top: calc(2px - var(--th, 24px));
  width: var(--tw, 9px);
  height: var(--th, 24px);
  margin-left: calc(var(--tw, 9px) / -2);
  background: radial-gradient(50% 70% at 50% 100%, var(--wisp, #57e0b0) 0%, transparent 72%);
  filter: blur(1.6px);
  opacity: 0.55;
  transform-origin: 50% 100%;
  animation: cardfx-wisp-waver var(--waver-dur, 2s) ease-in-out infinite;
}
/* One animation on .p: the wander (four waypoints, back to 0) AND the opacity envelope, so respawn
   fires once, at opacity 0 — which also hides the wander's loop-point reset. */
@keyframes cardfx-wisp-life {
  0% {
    opacity: 0;
    translate: 0 0;
  }
  8% {
    opacity: 1;
  }
  27% {
    translate: var(--w1, 0 0);
  }
  46% {
    translate: var(--w2, 0 0);
  }
  65% {
    translate: var(--w3, 0 0);
  }
  84% {
    translate: var(--w4, 0 0);
  }
  92% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    translate: 0 0;
  }
}
/* A guttering flame: brightness and size jitter, never quite steady. */
@keyframes cardfx-wisp-flicker {
  0%,
  100% {
    filter: brightness(1);
    transform: scale(1);
  }
  30% {
    filter: brightness(1.4);
    transform: scale(1.09);
  }
  55% {
    filter: brightness(0.82);
    transform: scale(0.95);
  }
  78% {
    filter: brightness(1.2);
    transform: scale(1.04);
  }
}
/* The tail licks side to side and breathes — a flame bending in a draught. */
@keyframes cardfx-wisp-waver {
  0%,
  100% {
    transform: skewX(-8deg) scaleY(0.94);
  }
  50% {
    transform: skewX(8deg) scaleY(1.12);
  }
}
`,
};
