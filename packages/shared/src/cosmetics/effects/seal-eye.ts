import type { SealModule } from '../types';

/**
 * The Eye seal — EARNED at 100 hours of watch time, recolourable via its own earned upgrade
 * (seal-eye-color, at 250 hours). A single crimson line-art eye stamped in the seal slot: it stares,
 * glances and blinks in place. One bold staring silhouette is exactly the kind of mark that survives
 * 14px in the chat gutter — the eye you half-notice is the unsettling one. Every layer (iris, outline,
 * glow) reads from `var(--seal-tint, <crimson>)`, which the surface sets when a colour is equipped
 * (see SealModule.colorUpgrade / EquippedCosmetics.sealColors).
 *
 * Same three-surface build as the card effect, pinned to ONE fixed eye:
 *  - the element carries the BLINK (a scaleY of the whole eye, lids closing toward the midline) and
 *    the neon GLOW (drop-shadow on the unmasked element — a mask would clip a drop-shadow away).
 *  - `::before` the IRIS (ring + pupil + hot core) clipped to the eye aperture, glancing by moving
 *    its background-position so the eyeball darts under fixed lids.
 *  - `::after` the wobbly stroked OUTLINE, painted crimson, on top so the eyeball tucks under the lids.
 * Sizes are in %/em so the eye tracks the surface's font-size like every other seal.
 */

// The hand-drawn almond outline (thick upper lid / thin lower lid / short lash), wobbled by a
// turbulence displacement so the line shakes like a pen stroke rather than reading as a clean lens.
const OUTLINE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 54'%3E%3Cfilter id='r'%3E%3CfeTurbulence type='turbulence' baseFrequency='0.03' numOctaves='2' seed='7' result='n'/%3E%3CfeDisplacementMap in='SourceGraphic' in2='n' scale='1.6'/%3E%3C/filter%3E%3Cg filter='url(%23r)' fill='none' stroke='%23fff' stroke-linecap='round'%3E%3Cpath d='M3,29 C22,7 78,6 98,24' stroke-width='6'/%3E%3Cpath d='M5,29 C24,47 74,47 95,26' stroke-width='2.9'/%3E%3Cpath d='M98,24 l7,-5 M99,27 l8,-1' stroke-width='2.9'/%3E%3C/g%3E%3C/svg%3E\") center/contain no-repeat";
// A filled almond, slightly inside the outline — the eye APERTURE, used to clip the iris so the
// eyeball can never poke past the lids.
const APERTURE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 54'%3E%3Cpath fill='%23fff' d='M4,28 C22,10 78,10 96,27 C78,45 22,45 4,28 Z'/%3E%3C/svg%3E\") center/contain no-repeat";

export const sealEye: SealModule = {
  id: 'seal-eye',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'watchMinutes', count: 6000 },
  colorUpgrade: 'seal-eye-color',
  since: '2026-07-24',
  className: 'seal-fx-eye',
  labels: { name: 'shop.sealEye', desc: 'shop.sealEyeDesc' },
  css: `
.seal-fx-eye {
  position: relative;
  overflow: visible;
  /* Lids close toward the midline; blink lives here so it squashes the whole eye + its glow. */
  transform-origin: center;
  animation: seal-eye-blink 5.4s ease-in-out infinite;
  /* Neon glow on the unmasked element (the masked pseudos would clip a drop-shadow). In em to scale. */
  filter: drop-shadow(0 0 0.05em var(--seal-tint, #ff3355)) drop-shadow(0 0 0.13em var(--seal-tint, #ff3355));
}
/* The eye is wide and short (100:54) — a centred horizontal band of the square seal box. */
.seal-fx-eye::before,
.seal-fx-eye::after {
  content: '';
  position: absolute;
  left: 0;
  width: 100%;
  top: 50%;
  height: 56%;
  margin-top: -28%;
}
/* The IRIS — ring + pupil + hot core, CLIPPED to the aperture so the eyeball stays under the lids; it
   looks around by moving its background-POSITION (the clip stays put, the eyeball darts inside it). */
.seal-fx-eye::before {
  background-repeat: no-repeat;
  background-size: 44% 82%;
  background-position: 50% 50%;
  background-image:
    radial-gradient(circle at 38% 34%, #fff 0 6%, transparent 9%),
    radial-gradient(
      circle,
      var(--seal-tint, #ff3355) 0 20%,
      transparent 24% 44%,
      var(--seal-tint, #ff3355) 48% 58%,
      transparent 62%
    );
  -webkit-mask: ${APERTURE};
  mask: ${APERTURE};
  /* A different period from the blink (5.4s) so the two drift apart instead of always coinciding. */
  animation: seal-eye-look 7.6s ease-in-out infinite;
}
/* The LIDS / outline — the wobbly crimson stroke, painted on top of the iris. */
.seal-fx-eye::after {
  background: var(--seal-tint, #ff3355);
  -webkit-mask: ${OUTLINE};
  mask: ${OUTLINE};
}
/* Blink: open most of the cycle, two quick closes. scaleY IS the lids. */
@keyframes seal-eye-blink {
  0%, 40% { transform: scaleY(1); }
  43% { transform: scaleY(0.1); }
  46% { transform: scaleY(1); }
  78% { transform: scaleY(1); }
  81% { transform: scaleY(0.1); }
  84% { transform: scaleY(1); }
  100% { transform: scaleY(1); }
}
/* Glance: the eyeball GLIDES between spots and holds there — each move is an ease-in-out slide (smooth
   out of one spot and into the next, like the card effect), not an ease-out snap. Modest excursions so
   the pupil stays legible under the lids. Clipped to the aperture. */
@keyframes seal-eye-look {
  0%, 22% { background-position: 50% 50%; }
  34%, 46% { background-position: 64% 47%; }
  58%, 66% { background-position: 50% 50%; }
  78%, 88% { background-position: 37% 55%; }
  100% { background-position: 50% 50%; }
}
`,
};
