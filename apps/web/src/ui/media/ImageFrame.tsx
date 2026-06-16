import { useState } from 'react';
import { Icon } from '@/ui/icons';
import { MediaFrame, matHeightClass } from './MediaFrame';
import type { MediaSize } from './types';

export interface ImageFrameProps {
  src: string;
  alt?: string;
  size?: MediaSize;
  /** Шахматная подложка под прозрачные PNG (по умолчанию вкл. для картинок). */
  transparent?: boolean;
  scanlines?: boolean;
  className?: string;
}

/** Изображение в единой пиксельной рамке (с подложкой для прозрачных PNG). */
export function ImageFrame({
  src,
  alt = '',
  size = 'queue',
  transparent = true,
  scanlines = false,
  className = '',
}: ImageFrameProps) {
  const [error, setError] = useState(false);
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
      ) : (
        <img
          src={src}
          alt={alt}
          onError={() => setError(true)}
          className={`block w-auto max-w-full object-contain [image-rendering:auto] ${matHeightClass(size)}`}
        />
      )}
    </MediaFrame>
  );
}
