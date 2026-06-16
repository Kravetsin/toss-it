/** Достаёт id ролика из YouTube-ссылки в тексте (для клиентского превью). */
export function youtubeIdFromText(text: string): string | null {
  const m = text.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/i,
  );
  return m?.[1] ?? null;
}

/** URL превью-картинки ролика по его id. */
export function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}
