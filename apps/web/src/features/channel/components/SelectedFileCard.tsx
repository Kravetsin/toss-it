import { useI18n } from '@/i18n';
import { mb } from '@/lib/format';
import { Card } from '@/ui';

/** Превью выбранного файла по его типу (image/video/audio). */
function FilePreview({ file, url }: { file: File; url: string | null }) {
  if (!url) return null;
  const cls = 'max-h-72 w-full rounded-none object-contain bg-black/40 [image-rendering:auto]';
  if (file.type.startsWith('image/')) return <img src={url} className={cls} />;
  if (file.type.startsWith('video/')) return <video src={url} controls muted className={cls} />;
  if (file.type.startsWith('audio/')) return <audio src={url} controls className="w-full" />;
  return null;
}

/** Карточка выбранного файла: превью + имя/размер + кнопка убрать. */
export function SelectedFileCard({
  file,
  url,
  onRemove,
}: {
  file: File;
  url: string | null;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-3">
      <FilePreview file={file} url={url} />
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted">
          {file.name} · {mb(file.size, 1)} MB
        </p>
        <button
          onClick={onRemove}
          className="shrink-0 cursor-pointer text-sm text-muted hover:text-danger"
        >
          {t('channel.removeFile')}
        </button>
      </div>
    </Card>
  );
}
