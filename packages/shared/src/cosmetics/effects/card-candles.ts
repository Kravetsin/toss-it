import type { CardEffectModule } from '../types';

/**
 * A row of ritual candles left burning in a graveyard: each flame breathes on its own phase, every 9
 * seconds ONE SHARED GUST leans the whole row at once, and every third gust puts one of them OUT —
 * after which it quietly catches again on its own.
 *
 * THE DREAD IS IN THE PLACE, NOT THE PROPS. No headstones, no crosses, no skulls: at pill size those
 * are illegible clutter, and spelled-out horror stops being frightening the moment it is named. The
 * scene does it with two things instead — cold moonlight from above (the opposite temperature to the
 * flames, so the warm lights read as holding out against the room) and ground fog creeping along the
 * bottom edge IN FRONT of the wax. See the css: the two sit on opposite sides of the candles in paint
 * order, which is what makes them a place rather than a backdrop.
 *
 * WHY THE GUST IS THE POINT. Every other card effect is a swarm of independent particles — nothing in
 * the catalog ever happens to all of them at the same moment. The gust is that missing beat: the row
 * reads as one lit SCENE reacting to a draught rather than as N unrelated flames. It works because the
 * gust animation carries `delay: 0` for every candle (the flicker keeps the usual negative desync), and
 * all of a card's particles are created in the same frame, so their timelines start together.
 *
 * Deliberately per CARD, not global: two senders' cards drift apart in phase, which is right — each
 * card is its own room with its own draught. Nothing coordinates them, and nothing should.
 *
 * TWO PROPERTIES, TWO ANIMATIONS, ONE ELEMENT. The flame runs the flicker AND the gust at once, which
 * the catalog has learned twice over is impossible through `transform` (one property, last rule wins —
 * see NickEffectModule.animation). Here the flicker animates `scale` + `filter` and the gust animates
 * `rotate`: separate individual transform properties, so neither can delete the other.
 *
 * THE CANDLE is `.p` (the wax body) plus its two pseudos: `::before` the flame, `::after` the halo it
 * throws on the wall behind it. The body carries NO animation, so bindRespawn never fires — and that is
 * correct: a candle stands where it was placed. It also means the row survives `prefers-reduced-motion`
 * as a still-life instead of vanishing the way a fading swarm does.
 *
 * WHY THE SPACING IS A SEQUENCE, NOT A GRID. `particle()` knows its own index but never the swarm's
 * size, so "spread N candles evenly" cannot be computed — a fixed step tuned for 5 would huddle 3 of
 * them at one end. The van der Corput sequence (below) is even for EVERY prefix length, so the same
 * rule lays out a 3-candle pill and a 5-candle card equally well.
 */

/**
 * Van der Corput (base 2): 0.5, 0.25, 0.75, 0.125, 0.625, … — bit-reversed index in [0, 1). Each new
 * point lands in the largest remaining gap, so any prefix of it is evenly spread.
 */
function vdc(index: number): number {
  let denom = 2;
  let out = 0;
  for (let n = index + 1; n > 0; n = Math.floor(n / 2)) {
    if (n % 2) out += 1 / denom;
    denom *= 2;
  }
  return out;
}

export const cardCandles: CardEffectModule = {
  id: 'card-candles',
  type: 'card_effect',
  costDust: 4000,
  since: '2026-08-05',
  className: 'card-fx-candles',
  // Both overlays mount every card effect as `compact`, so the small row IS the streamed look —
  // it gets three candles rather than a thinned-out five, which would read as a gappy fence.
  counts: { web: 5, overlayCard: 4, overlayChat: 3 },
  labels: { name: 'shop.cardCandles', desc: 'shop.cardCandlesDesc' },
  particle: (rnd, compact, index) => {
    // Even spread from the index alone (see vdc), pulled off the corners, plus a little jitter so the
    // row reads as set down by hand and not laid out on a grid.
    const left = 10 + vdc(index) * 80 + rnd(-3, 3);
    const cw = compact ? rnd(3.2, 4.2) : rnd(5, 7);
    // One flicker cycle. Short and varied — a flame is never still, and no two agree on the beat.
    const fdur = rnd(0.9, 1.5);
    return {
      left: `${left.toFixed(1)}%`,
      '--cw': `${cw.toFixed(1)}px`,
      // Candles burn down by different amounts — a row of equal sticks looks manufactured.
      '--ch': compact ? `${rnd(7, 12).toFixed(1)}px` : `${rnd(15, 29).toFixed(1)}px`,
      '--fdur': `${fdur.toFixed(2)}s`,
      '--fdelay': `${(-rnd(0, fdur)).toFixed(2)}s`,
      // Exactly ONE candle per card gets snuffed and relights (see the snuff keyframe). Assigned by
      // index rather than rolled: a roll gives some cards two of them (the moment stops being an
      // event) and some none. Index 1, not 0, so it isn't always the middle of the row.
      ...(index === 1 ? { '--snuff': 'cardfx-candle-snuff' } : {}),
    };
  },
  css: `
/* THE PLACE — the graveyard the candles were left in. Both of these live on the LAYER's own pseudo-
   elements (the candles are \`.p\` CHILDREN, so ::before/::after here are free), and they sit on
   opposite sides of the row in paint order, which is the whole trick:
     ::before paints BEFORE the children → cold moonlight BEHIND the candles;
     ::after  paints AFTER  the children → ground fog IN FRONT of them.
   Fog in front is what puts the candles INSIDE the scene instead of on top of a backdrop: it drowns
   the bases of the wax while the flames stay clear above it. */
.card-fx-candles::before,
.card-fx-candles::after {
  content: '';
  position: absolute;
  pointer-events: none;
}
/* Moonlight: a cold wash from above, deliberately the OPPOSITE temperature to the flames. The dread
   is in the contrast — warm little lights holding out against a cold room — so this stays blue and
   stays weak; brighten it and it reads as a colour filter over the card. */
.card-fx-candles::before {
  inset: 0;
  background:
    linear-gradient(180deg, rgba(126, 158, 202, 0.11), rgba(86, 116, 158, 0.035) 38%, transparent 62%),
    radial-gradient(120% 70% at 50% 0%, transparent 40%, rgba(4, 8, 14, 0.38) 100%);
  animation: cardfx-candles-moon 19s ease-in-out infinite;
}
/* Ground fog: a low band creeping along the bottom edge, drifting sideways and swelling. Blurred and
   thin — it is weather, not an object, and it must never compete with the flames for attention. */
.card-fx-candles::after {
  left: -25%;
  right: -25%;
  bottom: -8%;
  height: 30%;
  background:
    radial-gradient(46% 100% at 18% 100%, rgba(198, 212, 224, 0.26), transparent 72%),
    radial-gradient(42% 100% at 52% 100%, rgba(180, 198, 212, 0.22), transparent 74%),
    radial-gradient(38% 100% at 84% 100%, rgba(206, 216, 228, 0.2), transparent 72%);
  filter: blur(3px);
  animation: cardfx-candles-fog 23s ease-in-out infinite;
}
/* A short row has no room for a 30% band — it would swallow the candles whole. */
.card-fx-candles.compact::after {
  height: 46%;
  filter: blur(2px);
  opacity: 0.75;
}
@keyframes cardfx-candles-moon {
  0%,
  100% {
    opacity: 0.85;
  }
  50% {
    opacity: 1;
  }
}
@keyframes cardfx-candles-fog {
  0%,
  100% {
    transform: translateX(-4%) scaleY(1);
    opacity: 0.8;
  }
  50% {
    transform: translateX(4%) scaleY(1.14);
    opacity: 1;
  }
}

/* THE BODY — a stub of wax standing ON the bottom edge, lit from its own flame (brightest at the top,
   falling off toward the base). No animation here: see the header, this is what keeps bindRespawn out
   and lets a candle stay where it was put. */
.card-fx-candles .p {
  bottom: 0;
  top: auto;
  width: var(--cw, 6px);
  height: var(--ch, 22px);
  margin-left: calc(var(--cw, 6px) / -2);
  opacity: 1;
  border-radius: 2px 2px 0 0;
  background: linear-gradient(
    180deg,
    rgba(255, 244, 224, 0.85),
    rgba(255, 226, 180, 0.35) 55%,
    rgba(255, 214, 160, 0.12)
  );
  box-shadow: 0 0 10px rgba(255, 190, 120, 0.18);
}
/* THE FLAME — a teardrop sitting on the wick, hinged at its BASE (transform-origin) so the gust lays
   it over instead of sliding it off the candle. Two animations, two different properties: the flicker
   owns \`scale\`/\`filter\`, the gust owns \`rotate\`. */
.card-fx-candles .p::before {
  content: '';
  position: absolute;
  left: 50%;
  bottom: calc(100% + 1px);
  width: calc(var(--cw, 6px) * 0.62);
  height: calc(var(--cw, 6px) * 1.5);
  margin-left: calc(var(--cw, 6px) * -0.31);
  border-radius: 50% 50% 45% 45%;
  background: radial-gradient(
    60% 55% at 50% 72%,
    #fff6e2 0 28%,
    #ffd489 55%,
    rgba(255, 150, 40, 0.85) 78%,
    rgba(255, 110, 20, 0) 100%
  );
  transform-origin: 50% 100%;
  /* THREE animations, three separate properties, three different clocks: the flicker (\`scale\`/\`filter\`,
     own short cycle, desynced), the gust (\`rotate\`, 9s, shared), and the snuff (\`opacity\`, 27s, shared,
     and only on the one candle that carries --snuff). Written out per-property because the shorthand
     can't mix a var()-chosen name with two fixed ones. */
  animation-name: cardfx-candle-flame, cardfx-candle-gust, var(--snuff, none);
  animation-duration: var(--fdur, 1.2s), 9s, 27s;
  animation-timing-function: ease-in-out, ease-in-out, ease-out;
  animation-delay: var(--fdelay, 0s), 0s, 0s;
  animation-iteration-count: infinite, infinite, infinite;
}
/* THE HALO — the light the flame throws behind it. On its own element rather than a box-shadow on the
   flame, because it must NOT follow the flame over when the gust hits: a candle leaning in a draught
   still lights the same patch of wall. */
.card-fx-candles .p::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: calc(100% - 2px);
  width: calc(var(--cw, 6px) * 5);
  height: calc(var(--cw, 6px) * 5);
  margin-left: calc(var(--cw, 6px) * -2.5);
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(255, 176, 74, 0.3) 0 22%,
    rgba(255, 140, 40, 0.12) 45%,
    transparent 70%
  );
  /* The halo dies with its flame: snuff comes LAST, and since both it and the halo animate opacity,
     the later one wins outright — so the snuffed candle trades its breathing halo for a steady one.
     A fair trade: a halo still glowing over a dead wick is the one thing that would break the moment. */
  animation-name: cardfx-candle-halo, var(--snuff, none);
  animation-duration: var(--fdur, 1.2s), 27s;
  animation-timing-function: ease-in-out, ease-out;
  animation-delay: var(--fdelay, 0s), 0s;
  animation-iteration-count: infinite, infinite;
}
/* Guttering: the flame stretches and squats around its base while its brightness wavers. */
@keyframes cardfx-candle-flame {
  0%,
  100% {
    scale: 1 1;
    filter: brightness(1);
  }
  28% {
    scale: 0.92 1.12;
    filter: brightness(1.25);
  }
  55% {
    scale: 1.06 0.94;
    filter: brightness(0.9);
  }
  78% {
    scale: 0.96 1.06;
    filter: brightness(1.15);
  }
}
@keyframes cardfx-candle-halo {
  0%,
  100% {
    opacity: 0.85;
  }
  30% {
    opacity: 1;
  }
  60% {
    opacity: 0.7;
  }
}
/* THE GUST — one timeline, \`delay: 0\` on every candle of a card, so the whole row leans TOGETHER.
   Most of the cycle is dead still (0–62%): the draught has to be an event, and an event needs quiet
   around it. Then a hard lean, an overshoot back, and a small settle. */
@keyframes cardfx-candle-gust {
  0%,
  62%,
  100% {
    rotate: 0deg;
  }
  68% {
    rotate: -21deg;
  }
  74% {
    rotate: 9deg;
  }
  80% {
    rotate: -5deg;
  }
  88% {
    rotate: 0deg;
  }
}
/* THE SNUFF — one candle goes out and comes back. 27s = three gusts, and the outage is placed on the
   THIRD one: two gusts pass with the row merely leaning, and the time the eye has stopped expecting
   anything is the time it goes dark. That is the whole reason this is 27s and not 9s — a candle that
   dies on every gust is a mechanism, and a mechanism isn't frightening.
   Relighting is left unexplained on purpose. Nothing in the scene lights it. */
@keyframes cardfx-candle-snuff {
  0%,
  87% {
    opacity: 1;
  }
  /* blown out at the peak of the third lean */
  88.5% {
    opacity: 0;
  }
  95% {
    opacity: 0;
  }
  /* it catches again on its own */
  97.5% {
    opacity: 0.55;
  }
  100% {
    opacity: 1;
  }
}
`,
};
