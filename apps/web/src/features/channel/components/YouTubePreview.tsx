import { Icon } from '@/ui/icons';
import { Card } from '@/ui';
import { YouTubeFrame } from '@/ui/media';

/** Превью YouTube-ролика по id (когда в тексте ссылка и нет файла). */
export function YouTubePreview({ ytId }: { ytId: string }) {
  return (
    <Card className="flex flex-col items-start gap-2">
      <YouTubeFrame youtubeId={ytId} size="submit" thumbnailOnly className="w-full" />
      <p className="flex items-center gap-1.5 label-mono text-muted">
        <Icon name="play" size={15} className="text-accent" />
        YouTube
      </p>
    </Card>
  );
}
