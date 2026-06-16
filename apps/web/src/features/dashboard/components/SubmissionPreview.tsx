import type { SubmissionSummary } from '@tmw/shared';

/** Превью отправки в очереди: картинка/видео/youtube/аудио + текст. */
export function SubmissionPreview({ s }: { s: SubmissionSummary }) {
  const cls = 'max-h-60 max-w-sm rounded-none bg-black/40';
  const media =
    s.kind === 'text' ? null : s.kind === 'image' ? (
      <img src={s.url} className={cls} />
    ) : s.kind === 'video' ? (
      <video src={s.url} controls muted className={cls} />
    ) : s.kind === 'youtube' ? (
      s.youtubeId ? (
        <iframe
          src={`https://www.youtube.com/embed/${s.youtubeId}`}
          className="aspect-video w-full max-w-sm rounded-none"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      ) : null
    ) : (
      <audio src={s.url} controls />
    );
  return (
    <div className="flex flex-col items-start gap-2">
      {media}
      {s.text && (
        <p className="whitespace-pre-wrap border-l-2 border-twitch/50 bg-surface-2 px-3 py-2 text-sm text-text">
          {s.text}
        </p>
      )}
    </div>
  );
}
