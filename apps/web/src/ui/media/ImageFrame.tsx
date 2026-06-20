import { useState } from 'react';
import { Icon } from '@/ui/icons';
import { MediaFrame, matHeightClass } from './MediaFrame';
import { Lightbox } from './Lightbox';
import type { MediaSize } from './types';

export interface ImageFrameProps {
  src: string;
  alt?: string;
  size?: MediaSize;
  /** Checkerboard backdrop for transparent PNGs (enabled by default). */
  transparent?: boolean;
  scanlines?: boolean;
  /** Click opens enlarged version in lightbox. */
  zoomable?: boolean;
  className?: string;
}

export function ImageFrame({
  src,
  alt = '',
  size = 'queue',
  transparent = true,
  scanlines = false,
  zoomable = false,
  className = '',
}: ImageFrameProps) {
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(false);
  const img = (
    <img
      src={src}
      alt={alt}
      onError={() => setError(true)}
      className={`block w-auto max-w-full object-contain ${matHeightClass(size)}`}
    />
  );
  return (
    <MediaFrame
      kind="image"
      transparent={transparent && !error}
      scanlines={scanlines}
      className={className}
    >
      {error ? (
        <div className="grid min-h-40 w-full place-items-center px-8 text-muted sm:min-h-56">
          <Icon name="image" size={size === 'submit' ? 32 : 24} />
        </div>
      ) : zoomable ? (
        <button
          type="button"
          onClick={() => setZoom(true)}
          aria-label={alt ? `${alt} — увеличить` : 'Увеличить изображение'}
          className="block cursor-pointer outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
        >
          {img}
        </button>
      ) : (
        img
      )}
      {zoomable && !error && (
        <Lightbox src={src} alt={alt} open={zoom} onClose={() => setZoom(false)} />
      )}
    </MediaFrame>
  );
}
