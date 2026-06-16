import { youtubeThumbnail } from '@/lib/youtube';
import { Icon } from '@/ui/icons';
import { Card } from '@/ui';

/** Превью YouTube-ролика по id (когда в тексте ссылка и нет файла). */
export function YouTubePreview({ ytId }: { ytId: string }) {
  return (
    <Card className="flex flex-col items-start gap-2">
      <img
        src={youtubeThumbnail(ytId)}
        className="max-h-60 w-full rounded-none bg-black/40 object-contain"
      />
      <p className="flex items-center gap-1.5 text-sm text-muted">
        <Icon name="play" size={15} className="text-twitch-light" />
        YouTube
      </p>
    </Card>
  );
}
