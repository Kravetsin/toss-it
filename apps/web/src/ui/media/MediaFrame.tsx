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
 * Единая рамка для всех медиа: угловатая, 1px-граница, мягкая тень (shadow-2 —
 * единственная тень у самой рамки), сверху — «мат» с медиа, снизу —
 * опциональный контрол-бар через разделитель. Тонкая акцентная кромка сверху
 * медиа-области роднит рамку с акцентными карточками системы.
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
      className={`group/frame relative flex flex-col overflow-hidden rounded-none border border-border bg-surface text-text shadow-2 ${className}`}
      {...rest}
    >
      {/* В фуллскрине медиа-область растягивается (flex-1), а само медиа внутри
          вписывается через object-contain — без обрезки для любого формата. */}
      <div
        className={`relative grid place-items-center ${
          fullscreen
            ? 'min-h-0 flex-1 bg-bg'
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

/** Высота «мата» по месту использования (на самом медиа-элементе). */
export function matHeightClass(size: MediaSize): string {
  return size === 'submit' ? 'max-h-72' : 'max-h-60';
}
