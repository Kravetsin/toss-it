import type { SealModule } from '../types';

/**
 * The Core: the CHAT seal, earned by messages sent. Replaces the butterfly, which was a fine creature
 * but said nothing about chatting. A charged hub ringed by marks that turn around it, a pulse of light
 * travelling through them — it reads as a thing kept running by traffic, which is what a chat is.
 *
 * The marks are deliberately UNEVEN — every third one long — because an evenly dotted circle reads as a
 * loading spinner. The rhythm is the point; it is not a code and promises no reading.
 *
 * Two rungs plus an earned colour upgrade, as with the nova and the black hole. The tier is the ring's
 * DENSITY — 8 marks against 16 — which is the one thing about a running core that can honestly say
 * "more": the same object carrying more traffic. The lit rung also glows, pulses faster and turns quicker.
 *
 * Needs more layers than an element plus two pseudo-elements can give (sixteen marks, a hub ring and a
 * core), so it ships inner markup — see SealModule.svg, the same route the black hole takes. The marks
 * are generated rather than hand-placed, which is what makes the travelling pulse exact: each one's
 * negative animation-delay is its position around the ring, so the wave arrives in order.
 */

const CX = 12;
const CY = 12;
/** Ring radius. Leaves room for a long mark (3.8) to sit radially without touching the box edge. */
const R = 9.3;
/** One trip of the pulse around the ring. Marks are phase-offset across exactly this. */
const WAVE = 2.4;

/**
 * One ring of marks. Every third is LONG, the rest are points — an uneven rhythm, so the ring reads as
 * something charged rather than as a dotted circle. Each mark's delay is its position, so the pulse
 * travels around instead of blinking all at once.
 *
 * The long marks carry a `transform` attribute for their radial angle, so the wave animation may only
 * touch OPACITY: a CSS transform on the same element would override that attribute and fling the mark
 * to the centre.
 */
const ring = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const x = CX + Math.cos(a) * R;
    const y = CY + Math.sin(a) * R;
    const delay = (-(i / count) * WAVE).toFixed(2);
    const style = `style="animation-delay:${delay}s"`;
    if (i % 3 === 0) {
      const deg = ((a * 180) / Math.PI + 90).toFixed(1);
      return (
        `<rect class="co-m" x="${(x - 0.5).toFixed(2)}" y="${(y - 1.9).toFixed(2)}" width="1" ` +
        `height="3.8" rx="0.5" transform="rotate(${deg} ${x.toFixed(2)} ${y.toFixed(2)})" ${style}/>`
      );
    }
    return `<circle class="co-m co-pale" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.85" ${style}/>`;
  }).join('');

const svgFor = (count: number) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  `<g class="co-ring">${ring(count)}</g>` +
  `<circle class="co-hub" cx="${CX}" cy="${CY}" r="3.2"/>` +
  `<circle class="co-core" cx="${CX}" cy="${CY}" r="1.4"/>` +
  `</svg>`;

/** Shared shell for both rungs; only the ring's density and the state differ. */
function core(rung: {
  id: string;
  count: number;
  className: string;
  marks: number;
  lit: boolean;
}): SealModule {
  const c = rung.className;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'messages', count: rung.count },
    colorUpgrade: 'seal-core-color',
    since: '2026-07-25',
    ladder: 'seal-core',
    className: c,
    labels: { name: 'shop.sealCore', desc: 'shop.sealCoreDesc' },
    svg: svgFor(rung.marks),
    css: `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names can't collide with
   anything outside a seal. Emitted by each rung; the duplicate in the concatenated sheet is inert. */
.seal-fx .co-ring {
  transform-box: view-box;
  transform-origin: ${CX}px ${CY}px;
  animation: seal-core-turn 9s linear infinite;
}
/* Marks light up in turn — the delays baked into the markup make that a travelling wave. Resting
   opacity is the dim end, so reduced-motion (animation off) leaves a readable ring rather than a
   half-lit accident. */
.seal-fx .co-m {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.35;
  animation: seal-core-wave ${WAVE}s ease-in-out infinite;
}
/* Points run paler than the long marks, so the rhythm reads even before anything moves. */
.seal-fx .co-pale {
  fill: #d9fff5;
}
.seal-fx .co-hub {
  fill: none;
  stroke: var(--seal-tint, #8df0cc);
  stroke-width: 1.1;
  transform-box: view-box;
  transform-origin: ${CX}px ${CY}px;
  animation: seal-core-hub ${WAVE}s ease-in-out infinite;
}
/* The hub core stays white whatever the tint — the hotspot convention the butterfly and the
   black hole both use, and what keeps the centre readable once the seal is recoloured dark. */
.seal-fx .co-core {
  fill: #ffffff;
}
@keyframes seal-core-turn {
  to {
    transform: rotate(360deg);
  }
}
@keyframes seal-core-wave {
  0%, 100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}
@keyframes seal-core-hub {
  0%, 100% {
    transform: scale(0.94);
  }
  50% {
    transform: scale(1.06);
  }
}
${
  rung.lit
    ? `.${c} {
  animation: seal-core-glow 3.4s ease-in-out infinite;
}
@keyframes seal-core-glow {
  0%, 100% {
    filter: drop-shadow(0 0 0.05em var(--seal-tint, #8df0cc));
  }
  50% {
    filter: drop-shadow(0 0 0.15em var(--seal-tint, #8df0cc))
      drop-shadow(0 0 0.3em var(--seal-tint, #8df0cc));
  }
}`
    : // Cold rung: a sparse ring on a quiet channel, turning slower, with no glow. Deliberately not
      // dimmed: a drained rung reads as a broken copy of the lit one, and nobody wears it. Doubled
      // selectors beat the shared block, which the lit rung emits again AFTER these rules — at equal
      // specificity its shorthand would undo them.
      `.seal-fx.${c} .co-ring {
  animation-duration: 15s;
}
.seal-fx.${c} .co-m {
  animation-duration: ${WAVE * 1.6}s;
}
.seal-fx.${c} .co-hub {
  animation-duration: ${WAVE * 1.6}s;
  stroke-width: 0.9;
}`
}
`,
  };
}

export const sealCoreCold = core({
  id: 'seal-core-cold',
  count: 500,
  className: 'seal-fx-core-cold',
  marks: 8,
  lit: false,
});

export const sealCore = core({
  id: 'seal-core',
  count: 3000,
  className: 'seal-fx-core',
  marks: 16,
  lit: true,
});

/**
 * The colour upgrade — EARNED like the seal itself (8000 messages, past the full ring's 3000), never
 * bought. Owning it turns on a #rrggbb picker stored in EquippedCosmetics.sealColors; the shop renders
 * that picker inside the core's own ladder row. Renders nothing itself.
 */
export const sealCoreColor: SealModule = {
  id: 'seal-core-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'messages', count: 8000 },
  upgrade: true,
  since: '2026-07-25',
  className: '',
  labels: { name: 'shop.sealColorCore', desc: 'shop.sealColorDesc' },
};
