import type { SealModule } from '../types';

/**
 * The Supernova: the SUBMISSIONS seal — the site's own spark is what a submission is worth, so the
 * sender's mark is that spark going off. Replaces the old ringed star, which failed for a reason worth
 * keeping written down: it was a figure stamped INSIDE a disc, and an emblem in a frame reads as a UI
 * icon no matter how it is shaded or spun. The butterfly and the eye work because they are the object
 * itself. So is this — there is no surround, the seal IS the star.
 *
 * Two rungs only (see the ladder note): the colour upgrade carries the rest of the progression, the
 * same trick the butterfly and the eye use. Fewer states to design, and the top one is customised
 * rather than merely brighter.
 *  - EMBER — the star before it goes: the same spark, dimmed and desaturated, no shockwave. Cold.
 *  - NOVA  — it detonates: hot white core, and shockwave rings racing outward on repeat, glowing.
 *
 * The silhouette is a spark with UNEVEN rays — the vertical pair runs the full height, the horizontal
 * pair stops well short. That asymmetry is what stops it reading as a symmetric little cross (the old
 * star's problem) and it survives 14px, since the long axis stays legible when detail is gone.
 *
 * Layers, and why they are split this way: the element is an UNMASKED container so its glow is free to
 * bloom (a `mask` is applied after `filter`, so a drop-shadow on a masked element gets clipped away to
 * that mask — see card-butterflies, which learned this the hard way). `::before` is the spark: a
 * radial-gradient painted through the spark mask, so the hot white core and the tinted body are one
 * layer and both follow `--seal-tint`. `::after` is the shockwave.
 */

// The spark, as a MASK (white = painted): vertical rays span the full box, horizontal ones stop at
// 3.4/20.6. Drawn as a mask rather than a filled image so the colour comes from CSS and `--seal-tint`
// can repaint the whole thing (a baked fill inside a data-URI cannot be themed).
const SPARK =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23fff' d='M12 0 C12 8.4 9.8 11.2 3.4 12 C9.8 12.8 12 15.6 12 24 C12 15.6 14.2 12.8 20.6 12 C14.2 11.2 12 8.4 12 0 Z'/%3E%3C/svg%3E\") center/contain no-repeat";

/** One detonation: the star's pulse and the shockwave share THIS period, and the wave leaves at 0%,
 *  the star's brightest instant. The glow deliberately takes no part — it is constant (see below),
 *  because a second pulsing thing always ended up looking like it ran on its own clock. */
const PULSE = 2.8;

/** Shared shell for both rungs; only the state (cold vs detonating) differs. */
function nova(rung: { id: string; count: number; className: string; lit: boolean }): SealModule {
  const c = rung.className;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'submissions', count: rung.count },
    colorUpgrade: 'seal-nova-color',
    since: '2026-07-25',
    ladder: 'seal-nova',
    className: c,
    labels: { name: 'shop.sealNova', desc: 'shop.sealNovaDesc' },
    css: `
.${c} {
  position: relative;
  ${
    rung.lit
      ? // A STEADY glow. Every phase tried for a pulsing one fought the shockwave for the eye —
        // whatever the timing, one of the two always looked like it was on its own clock. A constant
        // bloom just states "this star is lit" and leaves the motion to the ring.
        `filter: drop-shadow(0 0 0.1em var(--seal-tint, #8df0cc))
    drop-shadow(0 0 0.24em var(--seal-tint, #8df0cc));`
      : // Cold rung: whatever colour the viewer picked, dimmed and drained — a star that has not gone
        // off yet. Tier stays legible even when the seal is recoloured.
        `filter: brightness(0.62) saturate(0.72);`
  }
}
/* The spark. The gradient IS the shading — a hot white core bleeding into the tint — so the body is
   never the flat single fill that made the old star look like cut paper. */
.${c}::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle at 50% 50%,
    #ffffff 0 5%,
    var(--seal-tint, #8df0cc) 34%,
    var(--seal-tint, #8df0cc) 100%
  );
  -webkit-mask: ${SPARK};
  mask: ${SPARK};
  animation: seal-nova-pulse ${rung.lit ? `${PULSE}s` : '5.2s'} ease-in-out infinite;
}
/* The star pulses in LIGHT, not in size. Resizing the spark was the wrong axis: its ray tips sit on
   the very edge of the box, so every swell moved four points at once and read as a twitch at 15px —
   no easing fixed that, because the easing was never the problem. Brightest at 0%, when the wave is
   released, then it dims while the wave travels: the star spends itself. The 2% of scale left in is
   there only so the pulse is not purely tonal, which goes flat on a dark backdrop.
   Both rungs run this same pulse — the ember just runs it slower, under its own dimming filter. */
@keyframes seal-nova-pulse {
  0%, 100% {
    filter: brightness(1.38);
    transform: scale(1.02);
  }
  52% {
    filter: brightness(0.94);
    transform: scale(1);
  }
}
${
  rung.lit
    ? `/* The shockwave: a ring racing out from the core, on repeat. opacity 0 is the RESTING state, so
   reduced-motion (which kills the animation) leaves no stray ring parked around the spark. */
.${c}::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 0.075em solid var(--seal-tint, #8df0cc);
  opacity: 0;
  pointer-events: none;
  /* Travel and strength are SPLIT into two animations on the same period. A single keyframe set would
     force one easing on both, and that is what made the wave look switched off: it still had opacity
     when it ran out of keyframes. Now the front expands linearly — a wavefront does not brake — and
     the fade is what ends it, partway out, the way a sound wave spends itself. */
  animation:
    seal-nova-ring ${PULSE}s linear infinite,
    seal-nova-ring-fade ${PULSE}s linear infinite;
}
/* Travel only, and it runs past where the wave becomes invisible: nothing must be moving at the
   instant it disappears, or the eye reads a stop rather than a wave going quiet. */
@keyframes seal-nova-ring {
  0% {
    transform: scale(0.16);
  }
  100% {
    transform: scale(1.3);
  }
}
/* Strength only. Hand-shaped decay — steep at first, then a long faint tail that reaches zero around
   three quarters out, well before the front runs out of room. Interpolation stays linear so the curve
   is exactly these stops and nothing else. */
@keyframes seal-nova-ring-fade {
  0% {
    opacity: 0.9;
  }
  30% {
    opacity: 0.6;
  }
  55% {
    opacity: 0.32;
  }
  72% {
    opacity: 0.11;
  }
  84%,
  100% {
    opacity: 0;
  }
}
`
    : ''
}
`,
  };
}

export const sealNovaEmber = nova({
  id: 'seal-nova-ember',
  count: 25,
  className: 'seal-fx-nova-ember',
  lit: false,
});

export const sealNova = nova({
  id: 'seal-nova',
  count: 250,
  className: 'seal-fx-nova',
  lit: true,
});

/**
 * The colour upgrade — EARNED like the seal itself (at 500 submissions, past the nova's 250), never
 * bought. Owning it turns on a #rrggbb picker stored in EquippedCosmetics.sealColors['seal-nova'];
 * the shop renders that picker inside the nova's own ladder row. Renders nothing itself.
 */
export const sealNovaColor: SealModule = {
  id: 'seal-nova-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'submissions', count: 500 },
  upgrade: true,
  since: '2026-07-25',
  className: '',
  labels: { name: 'shop.sealColorNova', desc: 'shop.sealColorDesc' },
};
