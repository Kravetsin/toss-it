import type { Concept } from './scene';
import { thwip } from './thwip';

/**
 * What is still a CONCEPT rather than a catalogue item. The code rain, the well and the portal pair
 * all graduated into packages/shared/src/cosmetics/effects. Cut after review: thumps / wave / orb /
 * hexfield (deleted). The wand duel graduated too, as card-spellclash. What is left is the web shot,
 * parked: the scene works, filling its empty card does not. Delete this folder, PopBench.tsx and its
 * Section in GalleryPage once that is settled.
 */
export const POP_CONCEPTS: Concept[] = [thwip];
export type { Concept };
export { mountScene } from './scene';
