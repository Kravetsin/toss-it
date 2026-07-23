import type { SealModule } from '../types';

/**
 * The Gem: the "wealth" seal, earned by LIFETIME dust earned (never lowered by spending, so it can
 * only climb). A faceted hexagon whose material gets richer up the ladder — dull ore → cut → clear
 * mint → crown jewel. Same rules as the other seals: one bold silhouette that survives 14px in the
 * chat gutter, tier read from colour, only the top rungs glow.
 *
 * Thresholds are lifetime dust EARNED. The ladder is stretched at the top on purpose: dust arrives in
 * bulk (a send is 50, and channel points convert straight to dust), so a casual viewer clears the
 * first rungs while the crown stays a genuine long haul. See dustEarnedFor / users.dustEarned.
 */
function gem(rung: {
  id: string;
  count: number;
  className: string;
  svg: string;
  /** Peak glow [blur px, alpha] once the gem catches light; omit for the cold lower rungs. Keyframe
   *  name derives from className, so it never collides with another seal's glow. */
  glow?: [number, number];
}): SealModule {
  const kf = `${rung.className}-glow`;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'dustEarned', count: rung.count },
    since: '2026-07-23',
    ladder: 'seal-gem',
    className: rung.className,
    labels: { name: 'shop.sealGem', desc: 'shop.sealGemDesc' },
    css: `
.${rung.className} {
  background-image: url("data:image/svg+xml,${rung.svg}");
}
${
  rung.glow
    ? `.${rung.className} {
  animation: ${kf} 4.6s ease-in-out infinite;
}
@keyframes ${kf} {
  0%, 100% {
    filter: drop-shadow(0 0 1px rgba(174, 245, 224, 0.3));
  }
  50% {
    filter: drop-shadow(0 0 ${rung.glow[0]}px rgba(174, 245, 224, ${rung.glow[1]}));
  }
}`
    : ''
}
`,
  };
}

/** Faceted hexagon: a dark-ish body with a brighter edge + facet lines, so it reads as a CUT jewel
 *  with depth rather than a flat blob. Only the artwork colours change per rung.
 *
 *  Geometry note: a REGULAR hexagon — every vertex sits 10.4 from the centre, so all six sides and
 *  all six facet spokes are equal. Do not stretch it to a square bounding box: that equalises the
 *  footprint but breaks the six-fold symmetry, which is what actually reads as "cut stone". Its
 *  vertices ride the same circle the spark seal's ring traces, so the two seals feel one size. */
const GEM = (body: string, edge: string, facet: string, sw: string, coreDot?: string) =>
  `%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E` +
  `%3Cpath d='M12 1.6 L21 6.8 L21 17.2 L12 22.4 L3 17.2 L3 6.8 Z' fill='%23${body}' stroke='%23${edge}' stroke-width='${sw}'/%3E` +
  `%3Cpath d='M12 1.6 L12 22.4 M3 6.8 L12 12 L21 6.8 M3 17.2 L12 12 L21 17.2' fill='none' stroke='%23${facet}' stroke-width='1' opacity='0.85'/%3E` +
  (coreDot ? `%3Ccircle cx='12' cy='12' r='2' fill='%23${coreDot}'/%3E` : '') +
  `%3C/svg%3E`;

export const sealGemDull = gem({
  id: 'seal-gem-dull',
  count: 1000,
  className: 'seal-fx-gem-dull',
  svg: GEM('22303a', '4a5560', '33414d', '1.6'),
});

export const sealGemCut = gem({
  id: 'seal-gem-cut',
  count: 3000,
  className: 'seal-fx-gem-cut',
  svg: GEM('285a52', '5aa892', '3f7d70', '1.7'),
});

export const sealGemClear = gem({
  id: 'seal-gem-clear',
  count: 10_000,
  className: 'seal-fx-gem-clear',
  svg: GEM('2f8f78', '8df0cc', 'bff2e4', '1.8', 'eafff8'),
  glow: [3, 0.45],
});

export const sealGemCrown = gem({
  id: 'seal-gem-crown',
  count: 50_000,
  className: 'seal-fx-gem-crown',
  svg: GEM('3fae94', 'd9fff5', 'eafff9', '1.9', 'ffffff'),
  glow: [5, 0.7],
});
