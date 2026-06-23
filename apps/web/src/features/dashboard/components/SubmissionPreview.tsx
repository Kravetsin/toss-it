import { giphyGifUrl, type SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { AudioPlayer, ImageFrame, VideoThumb, YouTubeFrame } from '@/ui/media';

export function SubmissionPreview({ s }: { s: SubmissionSummary }) {
  const { t } = useI18n();
  const label = s.senderName ?? t('common.anon');
  const hint = s.durationMs > 0 ? s.durationMs / 1000 : undefined;

  const media =
    s.kind === 'image' ? (
      <ImageFrame src={s.url} alt={label} size="queue" zoomable className="max-w-sm" />
    ) : s.kind === 'gif' ? (
      s.giphyId ? (
        <ImageFrame
          src={giphyGifUrl(s.giphyId)}
          alt={label}
          size="queue"
          zoomable
          className="max-w-sm"
        />
      ) : null
    ) : s.kind === 'video' ? (
      <VideoThumb
        src={s.url}
        durationHintSec={hint}
        size="queue"
        label={label}
        className="w-full max-w-sm"
      />
    ) : s.kind === 'youtube' ? (
      s.youtubeId ? (
        <YouTubeFrame youtubeId={s.youtubeId} size="queue" />
      ) : null
    ) : s.kind === 'audio' ? (
      <AudioPlayer
        src={s.url}
        size="queue"
        durationHintSec={hint}
        label={label}
        className="w-full max-w-sm"
      />
    ) : null;

  return (
    <div className="flex flex-col items-start gap-2">
      {media}
      {s.text && (
        <p className="whitespace-pre-wrap border-l border-accent/50 bg-surface-2 px-3 py-2 text-sm text-text">
          {s.text}
        </p>
      )}
    </div>
  );
}
