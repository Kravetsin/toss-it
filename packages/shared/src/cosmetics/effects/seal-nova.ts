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
      ? `animation: seal-nova-glow 3.4s ease-in-out infinite;`
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
  animation: seal-nova-core ${rung.lit ? '3.4s' : '5.2s'} ease-in-out infinite;
}
/* Core breath. Shared keyframe across the rungs (identical, so the duplicate in the concatenated
   sheet is harmless); only the duration differs — the cold rung breathes slower. */
@keyframes seal-nova-core {
  0%, 100% {
    transform: scale(0.96);
  }
  50% {
    transform: scale(1.05);
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
  /* Shorter than the glow's period on purpose: the two drift apart instead of pulsing in lockstep,
     which is what keeps a repeating loop from reading as a metronome. */
  animation: seal-nova-ring 2.6s ease-out infinite;
}
@keyframes seal-nova-ring {
  0% {
    transform: scale(0.18);
    opacity: 0.9;
  }
  70% {
    opacity: 0.32;
  }
  100% {
    transform: scale(1.12);
    opacity: 0;
  }
}
@keyframes seal-nova-glow {
  0%, 100% {
    filter: drop-shadow(0 0 0.05em var(--seal-tint, #8df0cc));
  }
  50% {
    filter: drop-shadow(0 0 0.16em var(--seal-tint, #8df0cc))
      drop-shadow(0 0 0.3em var(--seal-tint, #8df0cc));
  }
}`
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
