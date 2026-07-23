import type { SealModule } from '../types';

/**
 * The Star: four rungs of ONE artifact, in a single file rather than four copies of the same
 * boilerplate (the one-effect-per-file rule is about separate effects). Earned by SUBMISSIONS —
 * the site's own spark is what a submission is worth, so the sender's mark is that spark sealed.
 *
 * A seal has to read at 14px in the chat gutter, where internal detail collapses into mush. So the
 * rungs never assemble or grow — the stamp stays put and only its MATERIAL changes: cold stone →
 * teal charge → brand mint → white-hot.
 */

/** Shared shell for every rung; only the artwork, threshold and glow differ. */
function star(rung: {
  id: string;
  count: number;
  className: string;
  name: string;
  desc: string;
  svg: string;
  /** Peak glow [blur px, alpha] once the spark lights up; omit for the cold lower rungs. The top
   *  rung glows harder so it still reads as the pinnacle. Keyframe name is derived from className, so
   *  two glowing rungs never collide on one shared name. */
  glow?: [number, number];
}): SealModule {
  const kf = `${rung.className}-glow`;
  return {
    id: rung.id,
    type: 'seal',
    costDust: 0,
    earn: { metric: 'submissions', count: rung.count },
    since: '2026-07-23',
    className: rung.className,
    labels: { name: rung.name, desc: rung.desc },
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

// The site's own 4-point stardust spark, sealed inside a ring. The spark fills the disc nearly to
// the edge, so it reads as "our star, but in a seal" — the ring is what tells it apart from the bare
// thread marker it hangs next to in chat. The TIER colours the spark itself (dim stone → teal →
// brand mint → white-hot); the disc stays dark so the spark always pops. No internal detail to lose
// at small sizes — a filled spark against a dark disc survives 14px.
const RING = (dark: string, stroke: string, sw: string) =>
  `%3Ccircle cx='12' cy='12' r='10.6' fill='%23${dark}' stroke='%23${stroke}' stroke-width='${sw}'/%3E`;
const SPARK = (fill: string) =>
  `%3Cg transform='translate(2.4 2.4) scale(0.8)'%3E%3Cpath d='M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z' fill='%23${fill}'/%3E%3C/g%3E`;
const RINGED = (dark: string, stroke: string, sw: string, spark: string) =>
  `%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E${RING(dark, stroke, sw)}${SPARK(spark)}%3C/svg%3E`;

export const sealStarDormant = star({
  id: 'seal-star-dormant',
  count: 25,
  className: 'seal-fx-star-dormant',
  name: 'shop.sealStarDormant',
  desc: 'shop.sealStarDormantDesc',
  svg: RINGED('0e1512', '454f5a', '1.6', '3d4650'),
});

export const sealStarCharged = star({
  id: 'seal-star-charged',
  count: 75,
  className: 'seal-fx-star-charged',
  name: 'shop.sealStarCharged',
  desc: 'shop.sealStarChargedDesc',
  svg: RINGED('0e1512', '62b09c', '1.7', '4f9a8c'),
});

export const sealStarLit = star({
  id: 'seal-star-lit',
  count: 200,
  className: 'seal-fx-star-lit',
  name: 'shop.sealStarLit',
  desc: 'shop.sealStarLitDesc',
  svg: RINGED('0c1a15', 'cdfff0', '1.8', '8df0cc'),
  glow: [4, 0.5],
});

export const sealStarAwake = star({
  id: 'seal-star-awake',
  count: 500,
  className: 'seal-fx-star-awake',
  name: 'shop.sealStarAwake',
  desc: 'shop.sealStarAwakeDesc',
  svg: RINGED('0c1a15', 'eafff9', '1.9', 'd9fff5'),
  glow: [6, 0.75],
});
