import { giphyGifUrl, type SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useClipboard } from '@/hooks/useClipboard';
import { IconButton, LinkedText } from '@/ui';
import { AudioPlayer, ImageFrame, VideoThumb, YouTubeFrame } from '@/ui/media';

export function SubmissionPreview({ s }: { s: SubmissionSummary }) {
  const { t } = useI18n();
  const { copiedKey, copy } = useClipboard();
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
    // data-no-drag marks what the card's swipe gesture must not steal: players and scrubbers need
    // the pointer, text needs to stay selectable. `contents` keeps the media layout untouched.
    <div className="flex flex-col items-start gap-2">
      {media && (
        <div data-no-drag className="contents">
          {media}
        </div>
      )}
      {s.text && (
        <div data-no-drag className="flex w-full items-start gap-2">
          <p className="min-w-0 flex-1 select-text whitespace-pre-wrap break-words border-l border-accent/50 bg-surface-2 px-3 py-2 text-sm text-text">
            <LinkedText text={s.text} />
          </p>
          <IconButton
            name={copiedKey ? 'check' : 'copy'}
            label={t('dash.copyText')}
            size="sm"
            active={!!copiedKey}
            onClick={() => copy(s.text!)}
          />
        </div>
      )}
    </div>
  );
}
