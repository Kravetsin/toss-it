import { COSMETICS } from '@tmw/shared';

/**
 * "What's new" bookkeeping: which catalog entries the viewer hasn't met yet.
 *
 * Two rules keep the dots from becoming wallpaper. An entry is only new for a WINDOW after its
 * `since` date — a dot that never expires stops being a signal. And an entry the viewer has
 * actually looked at is marked seen (see NewDot), so the dot goes out on its own.
 *
 * Deliberately client-only: this is view state, not the account's. Storage keeps just ids, and
 * drops any that fell out of the window on load, so it can't grow without bound.
 */

/** How long an entry stays new after `since`. */
const WINDOW_DAYS = 30;
const KEY = 'tossit_whats_new';

/**
 * Everything inside the freshness window right now. Computed once per page load: the catalog is
 * static and the window moves by days, so a long-lived tab showing a day-stale dot is fine.
 */
export const FRESH_IDS: ReadonlySet<string> = (() => {
  const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
  return new Set(
    COSMETICS.filter((c) => {
      const t = c.since ? Date.parse(c.since) : NaN;
      return !Number.isNaN(t) && t >= cutoff;
    }).map((c) => c.id),
  );
})();

/** Seen ids, minus anything no longer fresh — expiry doubles as the storage cleanup. */
export function loadSeen(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(raw)) return new Set();
    return new Set(raw.filter((id): id is string => typeof id === 'string' && FRESH_IDS.has(id)));
  } catch {
    // localStorage may be unavailable (private mode) — dots just never persist.
    return new Set();
  }
}

export function saveSeen(seen: ReadonlySet<string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // localStorage may be unavailable
  }
}
