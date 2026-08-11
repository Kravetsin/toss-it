import { useEffect, useState } from 'react';

export interface NaturalSize {
  width: number;
  height: number;
}

/**
 * Pixel size of the selected image or video, read from the local object URL — so the placement
 * preview can show the size the post will really take rather than the one the slider asked for.
 * Null while unknown: no file, a kind with nothing to measure (audio, text, a Giphy pick whose
 * original lives on their CDN), or a file the browser can't decode.
 */
export function useNaturalSize(file: File | null, previewUrl: string | null): NaturalSize | null {
  const [size, setSize] = useState<NaturalSize | null>(null);

  useEffect(() => {
    setSize(null);
    if (!file || !previewUrl) return;
    const isVideo = file.type.startsWith('video/');
    if (!isVideo && !file.type.startsWith('image/')) return;

    let cancelled = false;
    const el = document.createElement(isVideo ? 'video' : 'img') as HTMLVideoElement &
      HTMLImageElement;
    const onLoad = () => {
      if (cancelled) return;
      const width = isVideo ? el.videoWidth : el.naturalWidth;
      const height = isVideo ? el.videoHeight : el.naturalHeight;
      if (width && height) setSize({ width, height });
    };
    el.addEventListener(isVideo ? 'loadedmetadata' : 'load', onLoad, { once: true });
    if (isVideo) el.preload = 'metadata';
    el.src = previewUrl;

    return () => {
      cancelled = true;
    };
  }, [file, previewUrl]);

  return size;
}
