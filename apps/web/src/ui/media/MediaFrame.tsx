import type { HTMLAttributes, ReactNode, RefObject } from 'react';
import type { MediaKind, MediaSize } from './types';

export interface MediaFrameProps extends HTMLAttributes<HTMLDivElement> {
  kind: MediaKind;
  /** Шахматная подложка под прозрачные PNG. По умолчанию — только для изображений. */
  transparent?: boolean;
  /** Скан-линии на «мате» (никогда под контролами). По умолчанию выкл. */
  scanlines?: boolean;
  /** Контрол-бар, приклеенный снизу рамки (видео/аудио/yt). */
  bar?: ReactNode;
  /** Слой поверх медиа (центральная кнопка play, спиннер, ошибка). */
  overlay?: ReactNode;
  /** Полноэкранный режим: «мат» растягивается, шахматка гасится. */
  fullscreen?: boolean;
  rootRef?: RefObject<HTMLDivElement | null>;
  mediaClassName?: string;
  children: ReactNode;
}

/**
 * Единая пиксельная рамка для всех медиа: квадратная, 2px-граница, жёсткая
 * offset-тень (единственная тень — у самой рамки), сверху — «мат» с медиа,
 * снизу — опциональный контрол-бар через разделитель. Тонкая циан-кромка
 * сверху медиа-области роднит рамку с акцентными карточками системы.
 */
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
      className={`group/frame relative flex flex-col overflow-hidden rounded-none border-2 border-line bg-surface text-text card-pixel ${className}`}
      {...rest}
    >
      <div
        className={`relative grid place-items-center ${
          fullscreen
            ? 'min-h-0 flex-1 bg-bg-shadow'
            : isTransparent
              ? 'mat-checker'
              : 'bg-black/40'
        } ${mediaClassName}`}
      >
        {children}
        {scanlines && !fullscreen && (
          <div className="scanlines pointer-events-none absolute inset-0" aria-hidden />
        )}
        {overlay}
        <div
          className="pointer-events-none absolute inset-0 [box-shadow:inset_0_1px_0_0_var(--color-twitch)]"
          aria-hidden
        />
      </div>
      {bar}
    </div>
  );
}

/** Высота «мата» по месту использования (на самом медиа-элементе). */
export function matHeightClass(size: MediaSize): string {
  return size === 'submit' ? 'max-h-72' : 'max-h-60';
}
