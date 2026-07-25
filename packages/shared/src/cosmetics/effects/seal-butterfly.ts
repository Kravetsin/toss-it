import type { SealModule } from '../types';

/**
 * The Butterfly seal — EARNED at 1000 chat messages, recolourable via its own earned upgrade
 * (seal-butterfly-color, at 2000 messages). A single fuchsia butterfly perched in the seal slot: it
 * rests with its wings slightly open and flutters them a few times every few seconds, rather than
 * beating non-stop. Unlike the card effect it never flies — the slot is a fixed ~14–25px box, so it
 * PERCHES instead of wandering, which also keeps the silhouette centred and legible at gutter size. The wing colour + glow read from `var(--seal-tint, <fuchsia>)`, which the
 * surface sets when a colour is equipped (see SealModule.colorUpgrade / EquippedCosmetics.sealColors).
 *
 * Built like the card butterfly, minus the flight: the BODY is the element's own background (a slim
 * dark-magenta abdomen), the two WINGS are the pseudo-elements flapping about their inner edge via a
 * sign-mirrored rotateY under perspective (the foreshortening is what reads as a beat). Glow lives on
 * the unmasked element — a drop-shadow on a masked wing is clipped to the wing's own silhouette.
 * Sizes are in %/em so the whole thing tracks the surface's font-size like every other seal.
 */

// Right-wing silhouette (body edge at x=0): a triangular forewing + rounded hindwing. Mirror it in
// the mask itself for the left wing, so the flap is a plain sign-flipped rotateY (a scaleX(-1) would
// throw the wing across the body — see the card effect's header for the full reasoning).
const WING_PATH =
  'M2,50 C4,27 24,8 52,8 C68,8 82,9 88,14 C92,28 84,44 70,51 C48,58 16,58 2,56 Z M2,60 C18,61 44,66 64,80 C78,90 74,110 56,110 C40,110 14,94 2,78 Z';
const WING = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 116'%3E%3Cpath fill='%23fff' d='${WING_PATH}'/%3E%3C/svg%3E") center/contain no-repeat`;
const WING_L = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 116'%3E%3Cg transform='translate(100 0) scale(-1 1)'%3E%3Cpath fill='%23fff' d='${WING_PATH}'/%3E%3C/g%3E%3C/svg%3E") center/contain no-repeat`;

// Slim abdomen + head + two clubbed antennae, dark magenta so it reads against the bright wings.
const BODY =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 66'%3E%3Cg fill='%232a0820'%3E%3Crect x='10.5' y='16' width='3' height='44' rx='1.5'/%3E%3Ccircle cx='12' cy='14' r='3.2'/%3E%3Cpath d='M12,12 C10,7 8,5 5.5,3.5' fill='none' stroke='%232a0820' stroke-width='1.5' stroke-linecap='round'/%3E%3Cpath d='M12,12 C14,7 16,5 18.5,3.5' fill='none' stroke='%232a0820' stroke-width='1.5' stroke-linecap='round'/%3E%3Ccircle cx='5.5' cy='3.5' r='1.7'/%3E%3Ccircle cx='18.5' cy='3.5' r='1.7'/%3E%3C/g%3E%3C/svg%3E\") center/contain no-repeat";

export const sealButterfly: SealModule = {
  id: 'seal-butterfly',
  type: 'seal',
  costDust: 0,
  earn: { metric: 'messages', count: 1000 },
  colorUpgrade: 'seal-butterfly-color',
  since: '2026-07-24',
  className: 'seal-fx-butterfly',
  labels: { name: 'shop.sealButterfly', desc: 'shop.sealButterflyDesc' },
  css: `
.seal-fx-butterfly {
  position: relative;
  overflow: visible;
  /* Body only — scaled down from the full box so the wings have room to flank it. */
  background: ${BODY};
  background-size: auto 78%;
  /* Glow on the unmasked element (a mask on a wing would clip a drop-shadow to its silhouette): a
     bright inner edge wrapped in two fuchsia halos. In em so it scales with the seal. */
  filter:
    drop-shadow(0 0 0.04em #ffffff) drop-shadow(0 0 0.12em var(--seal-tint, #ff5cd0))
    drop-shadow(0 0 0.24em var(--seal-tint, #ff5cd0));
  /* A slow perch-bob so it reads alive even while the wings rest between beats. */
  animation: seal-bfly-bob 3.4s ease-in-out infinite;
}
/* A wing: the silhouette masks a fuchsia gradient with pale spots showing through, hinged at its
   inner edge and inset a hair from centre so the body shows in the gap. */
.seal-fx-butterfly::before,
.seal-fx-butterfly::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 56%;
  height: 65%;
  margin-top: -32.5%;
}
/* Right wing — folds inward with rotateY(+θ). */
.seal-fx-butterfly::after {
  left: 50%;
  margin-left: 3%;
  transform-origin: left center;
  background:
    radial-gradient(72% 62% at 34% 32%, #ffffff, var(--seal-tint, #ff2e9a) 68%),
    radial-gradient(16% 13% at 66% 30%, rgba(255, 255, 255, 0.5) 0 40%, transparent 62%),
    radial-gradient(13% 12% at 52% 74%, rgba(255, 255, 255, 0.34) 0 45%, transparent 64%);
  -webkit-mask: ${WING};
  mask: ${WING};
  animation: seal-bfly-flap-r 4.4s ease-in-out infinite;
}
/* Left wing — the mirrored silhouette, folding with rotateY(−θ); the SIGN mirrors the beat. */
.seal-fx-butterfly::before {
  right: 50%;
  margin-right: 3%;
  transform-origin: right center;
  background:
    radial-gradient(72% 62% at 66% 32%, #ffffff, var(--seal-tint, #ff2e9a) 68%),
    radial-gradient(16% 13% at 34% 30%, rgba(255, 255, 255, 0.5) 0 40%, transparent 62%),
    radial-gradient(13% 12% at 48% 74%, rgba(255, 255, 255, 0.34) 0 45%, transparent 64%);
  -webkit-mask: ${WING_L};
  mask: ${WING_L};
  animation: seal-bfly-flap-l 4.4s ease-in-out infinite;
}
/* Occasional flutter, not a constant beat: three quick wing-beats in the first ~1.4s, then the wings
   REST held slightly open for the rest of the cycle (the body-bob keeps it alive in between). */
@keyframes seal-bfly-flap-r {
  0% { transform: perspective(4em) rotateY(18deg); }
  6% { transform: perspective(4em) rotateY(72deg); }
  12% { transform: perspective(4em) rotateY(18deg); }
  18% { transform: perspective(4em) rotateY(72deg); }
  24% { transform: perspective(4em) rotateY(18deg); }
  30% { transform: perspective(4em) rotateY(72deg); }
  36%, 100% { transform: perspective(4em) rotateY(18deg); }
}
@keyframes seal-bfly-flap-l {
  0% { transform: perspective(4em) rotateY(-18deg); }
  6% { transform: perspective(4em) rotateY(-72deg); }
  12% { transform: perspective(4em) rotateY(-18deg); }
  18% { transform: perspective(4em) rotateY(-72deg); }
  24% { transform: perspective(4em) rotateY(-18deg); }
  30% { transform: perspective(4em) rotateY(-72deg); }
  36%, 100% { transform: perspective(4em) rotateY(-18deg); }
}
@keyframes seal-bfly-bob {
  0%, 100% { transform: translateY(2%); }
  50% { transform: translateY(-5%); }
}
`,
};
