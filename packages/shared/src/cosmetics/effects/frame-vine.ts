import type { FrameModule } from '../types';

/**
 * The first ORNAMENT frame: a drawn vine (stem, leaves, blossoms) rather than a light chasing the
 * contour. It opts out of the shared ring geometry (mask + padding) and paints four repeating SVG
 * tiles along the edges instead. Repeating means the ornament never stretches on a wider card, and
 * having no corner art means `border-radius: inherit` alone fits it to every surface's card shape —
 * the dashboard's square corners, the alert's 6px, the chat bubble's asymmetric one.
 */
export const frameVine: FrameModule = {
  id: 'frame-vine',
  type: 'frame',
  // EARNED, not bought: 3000 watch-minutes (50h) — and account-wide, summing every channel and month,
  // so it lands well above what a single channel's top-viewers board shows for a few days of watching.
  costDust: 0,
  earn: { metric: 'watchMinutes', count: 3000 },
  className: 'frame-fx-vine',
  labels: { name: 'shop.frameVine', desc: 'shop.frameVineDesc' },
  css: `
.frame-fx-vine::after {
  /* Not a ring: drop the shared mask/padding so the ornament paints straight onto the layer. */
  padding: 0;
  mask: none;
  -webkit-mask: none;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='124' height='11' viewBox='0 0 124 11'%3E%3Cpath d='M0 7 C 20 4, 41 4, 62 7 S 104 10, 124 7' fill='none' stroke='%233f7d4d' stroke-width='1.05' stroke-linecap='round'/%3E%3Cellipse cx='29' cy='4.2' rx='3.2' ry='1.6' fill='%234f9a5c' transform='rotate(-22 29 4.2)'/%3E%3Cellipse cx='80' cy='9.2' rx='2.9' ry='1.45' fill='%23427f50' transform='rotate(20 80 9.2)'/%3E%3Cellipse cx='110' cy='5' rx='2.6' ry='1.3' fill='%234f9a5c' transform='rotate(-17 110 5)'/%3E%3Cg transform='translate(54 4.6)'%3E%3Cg fill='%23cfe0b4'%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(72)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(144)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(216)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(288)'/%3E%3C/g%3E%3Ccircle r='0.9' fill='%23e9d79a'/%3E%3C/g%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='124' height='11' viewBox='0 0 124 11'%3E%3Cpath d='M0 4 C 20 7, 41 7, 62 4 S 104 1, 124 4' fill='none' stroke='%233f7d4d' stroke-width='1.05' stroke-linecap='round'/%3E%3Cellipse cx='29' cy='6.8' rx='3.2' ry='1.6' fill='%234f9a5c' transform='rotate(22 29 6.8)'/%3E%3Cellipse cx='80' cy='1.8' rx='2.9' ry='1.45' fill='%23427f50' transform='rotate(-20 80 1.8)'/%3E%3Cellipse cx='110' cy='6' rx='2.6' ry='1.3' fill='%234f9a5c' transform='rotate(17 110 6)'/%3E%3Cg transform='translate(54 6.4)'%3E%3Cg fill='%23cfe0b4'%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(72)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(144)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(216)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(288)'/%3E%3C/g%3E%3Ccircle r='0.9' fill='%23e9d79a'/%3E%3C/g%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='124' viewBox='0 0 11 124'%3E%3Cpath d='M7 0 C 4 20, 4 41, 7 62 S 10 104, 7 124' fill='none' stroke='%233f7d4d' stroke-width='1.05' stroke-linecap='round'/%3E%3Cellipse cx='4.2' cy='29' rx='1.6' ry='3.2' fill='%234f9a5c' transform='rotate(-22 4.2 29)'/%3E%3Cellipse cx='9.2' cy='80' rx='1.45' ry='2.9' fill='%23427f50' transform='rotate(20 9.2 80)'/%3E%3Cellipse cx='5' cy='110' rx='1.3' ry='2.6' fill='%234f9a5c' transform='rotate(-17 5 110)'/%3E%3Cg transform='translate(4.6 54)'%3E%3Cg fill='%23cfe0b4'%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(72)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(144)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(216)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(288)'/%3E%3C/g%3E%3Ccircle r='0.9' fill='%23e9d79a'/%3E%3C/g%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='124' viewBox='0 0 11 124'%3E%3Cpath d='M4 0 C 7 20, 7 41, 4 62 S 1 104, 4 124' fill='none' stroke='%233f7d4d' stroke-width='1.05' stroke-linecap='round'/%3E%3Cellipse cx='6.8' cy='29' rx='1.6' ry='3.2' fill='%234f9a5c' transform='rotate(22 6.8 29)'/%3E%3Cellipse cx='1.8' cy='80' rx='1.45' ry='2.9' fill='%23427f50' transform='rotate(-20 1.8 80)'/%3E%3Cellipse cx='6' cy='110' rx='1.3' ry='2.6' fill='%234f9a5c' transform='rotate(17 6 110)'/%3E%3Cg transform='translate(6.4 54)'%3E%3Cg fill='%23cfe0b4'%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(72)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(144)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(216)'/%3E%3Cellipse cx='0' cy='-2.1' rx='1.05' ry='1.9' transform='rotate(288)'/%3E%3C/g%3E%3Ccircle r='0.9' fill='%23e9d79a'/%3E%3C/g%3E%3C/svg%3E");
  background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
  background-position: top center, bottom center, left center, right center;
  animation: frame-vine-breathe 7s ease-in-out infinite, frame-vine-creep 90s linear infinite;
}
@keyframes frame-vine-breathe {
  0%, 100% {
    opacity: 0.8;
    filter: drop-shadow(0 0 1px rgba(120, 190, 130, 0.14));
  }
  50% {
    opacity: 1;
    filter: drop-shadow(0 0 3px rgba(150, 215, 155, 0.3));
  }
}
/* Creeps one full tile (124px) per lap, so the loop point is invisible; each edge drifts the way
   that reads as one vine circulating around the card rather than four sliding strips. */
@keyframes frame-vine-creep {
  from {
    background-position: left 0px top 0px, left 0px bottom 0px, left 0px top 0px, right 0px top 0px;
  }
  to {
    background-position: left 124px top 0px, left -124px bottom 0px, left 0px top -124px,
      right 0px top 124px;
  }
}
`,
};
