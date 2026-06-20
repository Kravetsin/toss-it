import { useState } from 'react';
import type { SubmissionSummary } from '@tmw/shared';
import { youtubeThumbnail } from '@/lib/youtube';
import { Icon } from '@/ui/icons';
import { KIND_ICON } from '../constants';

const BOX =
  'grid size-14 shrink-0 place-items-center overflow-hidden border border-border bg-surface-2';

export function SubmissionThumb({ s }: { s: SubmissionSummary }) {
  const [imgError, setImgError] = useState(false);

  const imgSrc =
    !imgError && s.kind === 'image'
      ? s.url
      : !imgError && s.kind === 'youtube' && s.youtubeId
        ? youtubeThumbnail(s.youtubeId)
        : null;

  if (imgSrc) {
    return (
      <div className={`${BOX} relative`}>
        <img
          src={imgSrc}
          alt=""
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
        {s.kind === 'youtube' && (
          <span className="absolute grid size-6 place-items-center bg-bg/70 text-text">
            <Icon name="play" size={14} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={BOX}>
      <Icon name={KIND_ICON[s.kind]} size={22} className="text-muted" />
    </div>
  );
}
