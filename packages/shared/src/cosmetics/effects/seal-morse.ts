import type { SealModule } from '../types';

/**
 * Morse: the CHAT seal, earned by messages sent. Replaces the butterfly, which was a fine creature but
 * said nothing about chatting — this one is literally a transmission tape, and every mark on the ring
 * stands for one message. A dot or a dash, dots and dashes running the loop, a highlight travelling
 * through them: the reading is "a stream of messages", which is exactly what the metric counts.
 *
 * Two rungs plus an earned colour upgrade, as with the nova and the black hole. The tier is the TAPE'S
 * DENSITY — a sparse ring of 8 marks against a full ring of 16 — which is the one thing about a
 * transmission that can honestly say "more": the same object carrying more traffic. The lit rung also
 * glows, runs its wave faster and turns quicker.
 *
 * Needs more layers than an element plus two pseudo-elements can give (sixteen marks, a hub ring and a
 * core), so it ships inner markup — see SealModule.svg, the same route the black hole takes. The marks
 * are generated rather than hand-placed, which is what makes the travelling highlight exact: each one's
 * negative animation-delay is its position around the ring, so the wave arrives in order.
 */

const CX = 12;
const CY = 12;
/** Ring radius. Leaves room for a dash (3.8 long) to sit radially without touching the box edge. */
const R = 9.3;
/** One trip of the highlight around the tape. Marks are phase-offset across exactly this. */
const WAVE = 2.4;

/**
 * One tape of marks. Every third is a DASH, the rest dots — an uneven rhythm, so the ring reads as
 * code rather than as a dotted circle. Each mark's delay is its position, so the highlight travels.
 *
 * The dashes carry a `transform` attribute for their radial angle, so the wave animation may only
 * touch OPACITY: a CSS transform on the same element would override that attribute and fling the mark
 * to the centre.
 */
const tape = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const x = CX + Math.cos(a) * R;
    const y = CY + Math.sin(a) * R;
    const delay = (-(i / count) * WAVE).toFixed(2);
    const style = `style="animation-delay:${delay}s"`;
    if (i % 3 === 0) {
      const deg = ((a * 180) / Math.PI + 90).toFixed(1);
      return (
        `<rect class="ms-m" x="${(x - 0.5).toFixed(2)}" y="${(y - 1.9).toFixed(2)}" width="1" ` +
        `height="3.8" rx="0.5" transform="rotate(${deg} ${x.toFixed(2)} ${y.toFixed(2)})" ${style}/>`
      );
    }
    return `<circle class="ms-m ms-pale" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="0.85" ${style}/>`;
  }).join('');

const svgFor = (count: number) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true">` +
  `<g class="ms-ring">${tape(count)}</g>` +
  `<circle class="ms-hub" cx="${CX}" cy="${CY}" r="3.2"/>` +
  `<circle class="ms-core" cx="${CX}" cy="${CY}" r="1.4"/>` +
  `</svg>`;

/** Shared shell for both rungs; only the tape's density and the state differ. */
function morse(rung: {
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
    colorUpgrade: 'seal-morse-color',
    since: '2026-07-25',
    ladder: 'seal-morse',
    className: c,
    labels: { name: 'shop.sealMorse', desc: 'shop.sealMorseDesc' },
    svg: svgFor(rung.marks),
    css: `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names can't collide with
   anything outside a seal. Emitted by each rung; the duplicate in the concatenated sheet is inert. */
.seal-fx .ms-ring {
  transform-box: view-box;
  transform-origin: ${CX}px ${CY}px;
  animation: seal-morse-turn 9s linear infinite;
}
/* Marks light up in turn — the delays baked into the markup make that a travelling wave. Resting
   opacity is the dim end, so reduced-motion (animation off) leaves a readable tape rather than a
   half-lit accident. */
.seal-fx .ms-m {
  fill: var(--seal-tint, #8df0cc);
  opacity: 0.35;
  animation: seal-morse-wave ${WAVE}s ease-in-out infinite;
}
/* Dots run paler than dashes, so the rhythm reads even before anything moves. */
.seal-fx .ms-pale {
  fill: #d9fff5;
}
.seal-fx .ms-hub {
  fill: none;
  stroke: var(--seal-tint, #8df0cc);
  stroke-width: 1.1;
  transform-box: view-box;
  transform-origin: ${CX}px ${CY}px;
  animation: seal-morse-hub ${WAVE}s ease-in-out infinite;
}
/* The transmitter itself stays white whatever the tint — the hotspot convention the butterfly and the
   black hole both use, and what keeps the centre readable once the seal is recoloured dark. */
.seal-fx .ms-core {
  fill: #ffffff;
}
@keyframes seal-morse-turn {
  to {
    transform: rotate(360deg);
  }
}
@keyframes seal-morse-wave {
  0%, 100% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
}
@keyframes seal-morse-hub {
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
  animation: seal-morse-glow 3.4s ease-in-out infinite;
}
@keyframes seal-morse-glow {
  0%, 100% {
    filter: drop-shadow(0 0 0.05em var(--seal-tint, #8df0cc));
  }
  50% {
    filter: drop-shadow(0 0 0.15em var(--seal-tint, #8df0cc))
      drop-shadow(0 0 0.3em var(--seal-tint, #8df0cc));
  }
}`
    : // Cold rung: a thin tape on a quiet channel. Dimmed and drained whatever colour the viewer picked,
      // so the tier survives recolouring. Doubled selectors beat the shared block, which the lit rung
      // emits again AFTER these rules — at equal specificity its shorthand would undo them.
      `.${c} {
  filter: brightness(0.62) saturate(0.72);
}
.seal-fx.${c} .ms-ring {
  animation-duration: 15s;
}
.seal-fx.${c} .ms-m {
  animation-duration: ${WAVE * 1.6}s;
}
.seal-fx.${c} .ms-hub {
  animation-duration: ${WAVE * 1.6}s;
  stroke-width: 0.9;
}`
}
`,
  };
}

export const sealMorseFaint = morse({
  id: 'seal-morse-faint',
  count: 500,
  className: 'seal-fx-morse-faint',
  marks: 8,
  lit: false,
});

export const sealMorse = morse({
  id: 'seal-morse',
  count: 3000,
  className: 'seal-fx-morse',
  marks: 16,
  lit: true,
});

/**
 * The colour upgrade — EARNED like the seal itself (8000 messages, past the full tape's 3000), never
 * bought. Owning it turns on a #rrggbb picker stored in EquippedCosmetics.sealColors; the shop renders
 * that picker inside the morse row. Renders nothing itself.
 */
export const sealMorseColor: SealModule = {
  id: 'seal-morse-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'messages', count: 8000 },
  upgrade: true,
  since: '2026-07-25',
  className: '',
  labels: { name: 'shop.sealColorMorse', desc: 'shop.sealColorDesc' },
};
