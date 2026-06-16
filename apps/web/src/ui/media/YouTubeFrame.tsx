import { useState } from 'react';
import { youtubeThumbnail } from '@/lib/youtube';
import { Icon } from '@/ui/icons';
import { MediaFrame } from './MediaFrame';
import type { MediaSize } from './types';

export interface YouTubeFrameProps {
  youtubeId: string;
  size?: MediaSize;
  /** Показать постер с кнопкой play; iframe грузится по клику (для превью отправки). */
  thumbnailOnly?: boolean;
  className?: string;
}

/** YouTube-ролик в единой рамке: постер+play → iframe по клику (или сразу iframe). */
export function YouTubeFrame({
  youtubeId,
  size = 'queue',
  thumbnailOnly = false,
  className = '',
}: YouTubeFrameProps) {
  const [active, setActive] = useState(!thumbnailOnly);
  const width = size === 'submit' ? 'w-full' : 'w-full max-w-sm';

  return (
    <MediaFrame kind="youtube" transparent={false} className={`${width} ${className}`}>
      <div className="relative aspect-video w-full">
        {active ? (
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}${thumbnailOnly ? '?autoplay=1' : ''}`}
            title="YouTube"
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <>
            <img
              src={youtubeThumbnail(youtubeId)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <button
              type="button"
              aria-label="Play"
              onClick={() => setActive(true)}
              className="group/yt absolute inset-0 grid place-items-center outline-none"
            >
              <span className="grid h-12 w-12 place-items-center rounded-none border-2 border-twitch bg-bg/70 text-twitch outline-twitch-light transition-colors duration-100 group-hover/yt:border-twitch-light group-hover/yt:bg-bg/85 group-focus-visible/yt:outline-2 group-focus-visible/yt:outline-offset-2 sm:h-14 sm:w-14">
                <Icon name="play" size={24} />
              </span>
            </button>
          </>
        )}
      </div>
    </MediaFrame>
  );
}
