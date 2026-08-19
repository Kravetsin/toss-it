/**
 * The one-way channel from "a submission just landed" to whichever earned background is on screen
 * (NebulaBackground / BlackHoleBackground). A registry rather than props, for the same reason
 * BackgroundStars keeps an imperative API: the send happens deep in the compose flow, the sky is a
 * sibling three levels up, and threading a callback between them would put a rendering concern in
 * every component along the way.
 *
 * Empty on every page that has no earned background — the calls are then no-ops, which is what lets
 * the caller stay unconditional.
 */

export interface PageBackgroundFx {
  /** Where the sky's centre is on screen right now, so a keepsake can be flown INTO it. */
  centre: () => { x: number; y: number };
  /** A submission arrived: light a new star in the field and flare the whole thing briefly. */
  ignite: () => void;
}

let fx: PageBackgroundFx | null = null;

/** Mounted background claims the slot; pass null on unmount. Last one mounted wins (only one shows). */
export function registerPageBackgroundFx(next: PageBackgroundFx | null): void {
  if (next || fx) fx = next;
}

/** Centre of the earned background, or null when the page has none. */
export function pageBackgroundCentre(): { x: number; y: number } | null {
  return fx ? fx.centre() : null;
}

/** Fire the arrival effect. Returns false when there is no background to answer — the caller then
 *  keeps its own fallback (a permanent star pinned to the sky). */
export function ignitePageBackground(): boolean {
  if (!fx) return false;
  fx.ignite();
  return true;
}
