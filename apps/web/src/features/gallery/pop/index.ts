import type { Concept } from './scene';
import { thwip } from './thwip';
import { spellclash } from './spellclash';

/**
 * What is still a CONCEPT rather than a catalogue item. The code rain, the well and the portal pair
 * all graduated into packages/shared/src/cosmetics/effects. Cut after review: thumps / wave / orb /
 * hexfield (deleted). What is left is the web shot, parked (the scene works, filling its empty card
 * does not), and the wand duel, up for review. Delete this folder, PopBench.tsx and its Section in
 * GalleryPage once that is settled.
 */
export const POP_CONCEPTS: Concept[] = [spellclash, thwip];
export type { Concept };
export { mountScene } from './scene';
