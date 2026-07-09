/** Format bytes as MB string. */
export function mb(bytes: number, digits = 0): string {
  return (bytes / 1024 / 1024).toFixed(digits);
}

/** Format seconds as m:ss (or h:mm:ss from an hour up) for UI display. */
export function clock(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const ms = `${h > 0 ? String(m).padStart(2, '0') : m}:${String(s).padStart(2, '0')}`;
  return h > 0 ? `${h}:${ms}` : ms;
}
