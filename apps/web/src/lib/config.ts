/** Dev: overlay on separate vite port. Prod: served by server under /overlay. */
export const OVERLAY_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5174'
  : `${window.location.origin}/overlay`;
