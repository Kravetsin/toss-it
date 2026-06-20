import type { HTMLAttributes, ReactNode, RefObject } from 'react';
import type { MediaKind, MediaSize } from './types';

export interface MediaFrameProps extends HTMLAttributes<HTMLDivElement> {
  kind: MediaKind;
  /** Checkered background for transparent PNGs; defaults to true for images only. */
  transparent?: boolean;
  /** Scan-lines on mat (never under controls); disabled by default. */
  scanlines?: boolean;
  /** Control bar attached below frame (video/audio/yt). */
  bar?: ReactNode;
  /** Overlay layer above media (play button, spinner, error). */
  overlay?: ReactNode;
  /** Fullscreen mode: mat stretches, checkered bg disabled. */
  fullscreen?: boolean;
  rootRef?: RefObject<HTMLDivElement | null>;
  mediaClassName?: string;
  children: ReactNode;
}

export function MediaFrame({
  kind,
  transparent,
  scanlines = false,
  bar,
  overlay,
  fullscreen = false,
  rootRef,
  mediaClassName = '',
  className = '',
  children,
  ...rest
}: MediaFrameProps) {
  const isTransparent = (transparent ?? kind === 'image') && !fullscreen;
  return (
    <div
      ref={rootRef}
      className={`group/frame relative flex flex-col overflow-hidden rounded-none border border-border bg-surface text-text shadow-2 ${className}`}
      {...rest}
    >
      {/* Fullscreen: media container flex-1, media itself via object-contain (no cropping). */}
      <div
        className={`relative grid place-items-center ${
          fullscreen ? 'min-h-0 flex-1 bg-bg' : isTransparent ? 'mat-checker' : 'bg-black/40'
        } ${mediaClassName}`}
      >
        {children}
        {scanlines && !fullscreen && (
          <div className="scanlines pointer-events-none absolute inset-0" aria-hidden />
        )}
        {overlay}
        {!fullscreen && (
          <div
            className="pointer-events-none absolute inset-0 [box-shadow:inset_0_1px_0_0_var(--color-accent)]"
            aria-hidden
          />
        )}
      </div>
      {bar}
    </div>
  );
}

/** Max height for mat based on context (on media element itself). */
export function matHeightClass(size: MediaSize): string {
  return size === 'submit' ? 'max-h-72' : 'max-h-60';
}
