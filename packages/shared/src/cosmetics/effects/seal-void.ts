import type { SealModule } from '../types';

/**
 * The Black Hole: the SPENDING seal, earned by LIFETIME dust spent. It began on dust EARNED, which
 * was the wrong axis for this artwork and worth writing down: earned dust is still yours, and a mark
 * showing it vanish said the opposite of what it measured. Spending is the thing that actually
 * matches — dust falls in and never comes back out, which is exactly what buying a cosmetic is.
 * The metric climbs only (every dust sink is permanent), so no rung can ever un-earn itself.
 *
 * Two rungs, plus a colour upgrade carrying the rest of the progression (same as the nova):
 *  - COLLAPSING — the disk is cold and thin, dust trickles in. Dim, no glow.
 *  - VOID       — a bright streaming disk and a full stream of infalling dust, glowing.
 *
 * REAL ORBITAL DEPTH is the point of the piece, and SVG cannot do it directly: paint order is document
 * order, so one node can't move behind the core mid-orbit. So every particle is drawn TWICE — one copy
 * before the core, one after — and each copy is visible for exactly the half of the orbit where it
 * belongs. The handoff happens at the ellipse's left and right vertices, where both copies sit at the
 * same point, so it is invisible. Their shared position keyframes are generated below rather than
 * hand-written, which is also what makes it cheap to give the far half a smaller scale and lower
 * opacity — the depth cue that sells the tilt.
 *
 * The disk is split the same way: its far half is drawn behind the core (and so is eclipsed by it),
 * its near half in front, crossing over the core. That crossing is the whole silhouette.
 */

const CX = 12;
const CY = 12;
const RX = 10.4;
const RY = 3.6;
/** Orbit samples. The path is interpolated linearly between them, and at 15° the chord sits under 1%
 *  off the true ellipse — well past the point where more samples would be visible. */
const STEPS = 24;
/** One full orbit. Particles share it and are spread around the ring by negative delays. */
const DUR = 5.5;

const PARTICLES = [
  { r: 0.85, white: true, delay: 0 },
  { r: 0.7, white: false, delay: -1.1 },
  { r: 0.62, white: true, delay: -2.2 },
  { r: 0.75, white: false, delay: -3.3 },
  { r: 0.58, white: true, delay: -4.4 },
];

/**
 * Position keyframes for ONE copy of a particle. `front` selects which half of the orbit this copy is
 * visible on: a particle is in front when it is low on screen, since the disk is seen from slightly
 * above. Both copies share identical positions, so a shared negative delay keeps them in lockstep and
 * the pair always reads as a single particle.
 */
function orbitFrames(name: string, front: boolean): string {
  let out = `@keyframes ${name} {\n`;
  for (let i = 0; i <= STEPS; i++) {
    const p = i / STEPS;
    const th = p * Math.PI * 2;
    const x = CX + RX * Math.cos(th);
    const y = CY + RY * Math.sin(th);
    const near = Math.sin(th) > 0;
    // 0 at the far vertex, 1 at the near one — drives both the size and the brightness falloff.
    const depth = (Math.sin(th) + 1) / 2;
    const scale = (0.68 + depth * 0.62).toFixed(2);
    const opacity = near === front ? (0.55 + depth * 0.45).toFixed(2) : '0';
    out += `  ${(p * 100).toFixed(2)}% { transform: translate(${x.toFixed(2)}px, ${y.toFixed(
      2,
    )}px) scale(${scale}); opacity: ${opacity}; }\n`;
  }
  return `${out}}\n`;
}

const ORBIT_CSS = `${orbitFrames('seal-void-front', true)}${orbitFrames('seal-void-back', false)}`;

/** Half of the disk. Sweeping from the left vertex runs over the top, which is the far side. */
const arc = (far: boolean) =>
  far
    ? `M${CX - RX} ${CY} A${RX} ${RY} 0 0 1 ${CX + RX} ${CY}`
    : `M${CX + RX} ${CY} A${RX} ${RY} 0 0 1 ${CX - RX} ${CY}`;

const motes = (side: 'front' | 'back') =>
  PARTICLES.map(
    (p) =>
      `<circle class="bh-p bh-${side}${p.white ? ' bh-w' : ''}" r="${p.r}" style="animation-delay:${p.delay}s"/>`,
  ).join('');

/** Layer order IS the depth: far arc, far particles, core, halo, near particles, near arc. */
const SVG =
  `<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-18 ${CX} ${CY})">` +
  `<path class="bh-arc bh-far" d="${arc(true)}"/>` +
  motes('back') +
  `<circle class="bh-core" cx="${CX}" cy="${CY}" r="4.6"/>` +
  `<circle class="bh-halo" cx="${CX}" cy="${CY}" r="4.95"/>` +
  motes('front') +
  `<path class="bh-arc bh-near" d="${arc(false)}"/>` +
  `</g></svg>`;

/** Shared shell for both rungs; only the state (cold vs blazing) differs. */
function voidSeal(rung: {
  id: string;
  count: number;
  className: string;
  lit: boolean;
}): SealModule {
  const c = rung.className;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'dustSpent', count: rung.count },
    colorUpgrade: 'seal-void-color',
    since: '2026-07-25',
    ladder: 'seal-void',
    className: c,
    labels: { name: 'shop.sealVoid', desc: 'shop.sealVoidDesc' },
    svg: SVG,
    css: `
/* Geometry shared by both rungs, scoped under .seal-fx so these short class names can't collide with
   anything outside the seal. Emitted by each rung; the duplicate in the concatenated sheet is inert. */
.seal-fx .bh-arc {
  fill: none;
  stroke: var(--seal-tint, #8df0cc);
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-dasharray: 5 3;
  animation: seal-void-stream 1.9s linear infinite;
}
/* The far half runs dimmer than the near one — the same depth cue the particles carry. */
.seal-fx .bh-far {
  opacity: 0.5;
}
/* The hole itself is the one thing that is NOT tinted: it emits nothing, so a recoloured seal must
   not recolour it. It is also what eclipses the far half of the disk and the far particles. */
.seal-fx .bh-core {
  fill: #05080a;
}
.seal-fx .bh-halo {
  fill: none;
  stroke: var(--seal-tint, #8df0cc);
  stroke-width: 1.05;
  animation: seal-void-halo 3.4s ease-in-out infinite;
}
.seal-fx .bh-p {
  fill: var(--seal-tint, #8df0cc);
  animation: seal-void-back ${DUR}s linear infinite;
}
/* White specks stay white whatever the tint — the same hotspot trick the butterfly's wings use. */
.seal-fx .bh-w {
  fill: #ffffff;
}
.seal-fx .bh-front {
  animation-name: seal-void-front;
}
@keyframes seal-void-stream {
  to {
    stroke-dashoffset: -8;
  }
}
@keyframes seal-void-halo {
  0%, 100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}
${ORBIT_CSS}${
      rung.lit
        ? `.${c} {
  animation: seal-void-glow 3.4s ease-in-out infinite;
}
@keyframes seal-void-glow {
  0%, 100% {
    filter: drop-shadow(0 0 0.05em var(--seal-tint, #8df0cc));
  }
  50% {
    filter: drop-shadow(0 0 0.15em var(--seal-tint, #8df0cc))
      drop-shadow(0 0 0.3em var(--seal-tint, #8df0cc));
  }
}`
        : // Cold rung: whatever colour the viewer picked, dimmed and drained, and the orbit runs slow —
          // a hole that is still collapsing. Tier stays legible even on a recoloured seal.
          //
          // Doubled up as `.seal-fx.${c}` on purpose. The shared block above is emitted by BOTH rungs,
          // so the lit rung's copy lands AFTER these rules in the concatenated sheet; at equal
          // specificity its `animation` shorthand would then reset the slow orbit back to the default.
          `.seal-fx.${c} .bh-p {
  animation-duration: ${DUR * 1.7}s;
}
.seal-fx.${c} .bh-arc {
  animation-duration: 3.4s;
  stroke-dasharray: 3 5;
}`
    }
`,
  };
}

export const sealVoidCollapsing = voidSeal({
  id: 'seal-void-collapsing',
  count: 2000,
  className: 'seal-fx-void-collapsing',
  lit: false,
});

export const sealVoid = voidSeal({
  id: 'seal-void',
  count: 10_000,
  className: 'seal-fx-void',
  lit: true,
});

/**
 * The colour upgrade — EARNED like the seal itself (25k spent, past the void's 10k), never bought.
 * Owning it turns on a #rrggbb picker stored in EquippedCosmetics.sealColors; the shop renders that
 * picker inside the void's own ladder row. Renders nothing itself.
 *
 * Sized against the catalog rather than picked round: buying EVERYTHING costs about 70k, so this is
 * roughly a third of it. The old 50k figure came from the earned axis, where it was reachable
 * without ever buying anything — on the spent axis it would have meant owning 70% of the shop.
 */
export const sealVoidColor: SealModule = {
  id: 'seal-void-color',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'dustSpent', count: 25_000 },
  upgrade: true,
  since: '2026-07-25',
  className: '',
  labels: { name: 'shop.sealColorVoid', desc: 'shop.sealColorDesc' },
};
