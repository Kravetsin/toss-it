/** Размер в МБ из байт (для подписей лимитов и выбранного файла). */
export function mb(bytes: number, digits = 0): string {
  return (bytes / 1024 / 1024).toFixed(digits);
}

/** Таймер mm:ss из секунд (кулдаун отправки). */
export function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
