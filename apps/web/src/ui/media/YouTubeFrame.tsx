import { useState } from 'react';
import { youtubeThumbnail } from '@/lib/youtube';
import { Icon } from '@/ui/icons';
import { MediaFrame } from './MediaFrame';
import type { MediaSize } from './types';

export interface YouTubeFrameProps {
  youtubeId: string;
  size?: MediaSize;
  thumbnailOnly?: boolean;
  className?: string;
}

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
              <span className="grid h-12 w-12 place-items-center rounded-none border border-accent bg-bg/70 text-accent transition-[color,background-color,border-color] duration-[180ms] ease-out group-hover/yt:border-accent-hover group-hover/yt:bg-bg/85 group-focus-visible/yt:[box-shadow:var(--shadow-focus)] sm:h-14 sm:w-14">
                <Icon name="play" size={24} />
              </span>
            </button>
          </>
        )}
      </div>
    </MediaFrame>
  );
}
