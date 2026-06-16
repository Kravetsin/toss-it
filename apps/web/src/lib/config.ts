/** В dev оверлей живёт на собственном vite-порту; в проде его раздаёт сервер под /overlay. */
export const OVERLAY_BASE_URL = import.meta.env.DEV
  ? 'http://localhost:5174'
  : `${window.location.origin}/overlay`;
