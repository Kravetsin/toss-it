import type { FrameModule } from '../types';

/**
 * First rung of the vine ladder (sprout → vine → bloom): the same plant before it flowers — stem and
 * leaves only. Each rung adds a visibly DIFFERENT element rather than more of the same, so the step up
 * reads at a glance instead of asking anyone to count blossoms.
 */
export const frameVineSprout: FrameModule = {
  id: 'frame-vine-sprout',
  type: 'frame',
  // EARNED, not bought: 1500 watch-minutes (25h) account-wide — the axis's entry rung.
  costDust: 0,
  earn: { metric: 'watchMinutes', count: 1500 },
  since: '2026-07-22',
  className: 'frame-fx-vine-sprout',
  labels: { name: 'shop.frameVineSprout', desc: 'shop.frameVineSproutDesc' },
  css: `
.frame-fx-vine-sprout::after {
  /* Not a ring: drop the shared mask/padding so the ornament paints straight onto the layer. */
  padding: 0;
  mask: none;
  -webkit-mask: none;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='124' height='11' viewBox='0 0 124 11'%3E%3Cpath d='M0 7 C 20 4, 41 4, 62 7 S 104 10, 124 7' fill='none' stroke='%233f7d4d' stroke-width='1.05' stroke-linecap='round'/%3E%3Cellipse cx='29' cy='4.2' rx='3.2' ry='1.6' fill='%234f9a5c' transform='rotate(-22 29 4.2)'/%3E%3Cellipse cx='80' cy='9.2' rx='2.9' ry='1.45' fill='%23427f50' transform='rotate(20 80 9.2)'/%3E%3Cellipse cx='110' cy='5' rx='2.6' ry='1.3' fill='%234f9a5c' transform='rotate(-17 110 5)'/%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='124' height='11' viewBox='0 0 124 11'%3E%3Cpath d='M0 4 C 20 7, 41 7, 62 4 S 104 1, 124 4' fill='none' stroke='%233f7d4d' stroke-width='1.05' stroke-linecap='round'/%3E%3Cellipse cx='29' cy='6.8' rx='3.2' ry='1.6' fill='%234f9a5c' transform='rotate(22 29 6.8)'/%3E%3Cellipse cx='80' cy='1.8' rx='2.9' ry='1.45' fill='%23427f50' transform='rotate(-20 80 1.8)'/%3E%3Cellipse cx='110' cy='6' rx='2.6' ry='1.3' fill='%234f9a5c' transform='rotate(17 110 6)'/%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='124' viewBox='0 0 11 124'%3E%3Cpath d='M7 0 C 4 20, 4 41, 7 62 S 10 104, 7 124' fill='none' stroke='%233f7d4d' stroke-width='1.05' stroke-linecap='round'/%3E%3Cellipse cx='4.2' cy='29' rx='1.6' ry='3.2' fill='%234f9a5c' transform='rotate(-22 4.2 29)'/%3E%3Cellipse cx='9.2' cy='80' rx='1.45' ry='2.9' fill='%23427f50' transform='rotate(20 9.2 80)'/%3E%3Cellipse cx='5' cy='110' rx='1.3' ry='2.6' fill='%234f9a5c' transform='rotate(-17 5 110)'/%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='124' viewBox='0 0 11 124'%3E%3Cpath d='M4 0 C 7 20, 7 41, 4 62 S 1 104, 4 124' fill='none' stroke='%233f7d4d' stroke-width='1.05' stroke-linecap='round'/%3E%3Cellipse cx='6.8' cy='29' rx='1.6' ry='3.2' fill='%234f9a5c' transform='rotate(22 6.8 29)'/%3E%3Cellipse cx='1.8' cy='80' rx='1.45' ry='2.9' fill='%23427f50' transform='rotate(-20 1.8 80)'/%3E%3Cellipse cx='6' cy='110' rx='1.3' ry='2.6' fill='%234f9a5c' transform='rotate(17 6 110)'/%3E%3C/svg%3E");
  background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
  background-position: top center, bottom center, left center, right center;
  animation: frame-vine-sprout-breathe 7s ease-in-out infinite,
    frame-vine-sprout-creep 90s linear infinite;
}
@keyframes frame-vine-sprout-breathe {
  0%, 100% {
    opacity: 0.72;
    filter: drop-shadow(0 0 1px rgba(120, 190, 130, 0.1));
  }
  50% {
    opacity: 0.92;
    filter: drop-shadow(0 0 3px rgba(150, 215, 155, 0.24));
  }
}
@keyframes frame-vine-sprout-creep {
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
