import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Card, ProgressBar } from '@/ui';

/** Карточка прогресса загрузки: процент или «сервер обрабатывает» + полоса. */
export function UploadProgress({ progress }: { progress: number | null }) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-3">
      <p className="flex items-center gap-2">
        <Icon name={progress === null ? 'loader' : 'upload'} size={18} />
        {progress === null
          ? t('channel.processing')
          : t('channel.uploading', { pct: Math.round(progress * 100) })}
      </p>
      <ProgressBar value={progress} />
    </Card>
  );
}
