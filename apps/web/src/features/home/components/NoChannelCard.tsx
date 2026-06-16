import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card } from '@/ui';

/** Онбординг: у пользователя ещё нет канала — предложить создать. */
export function NoChannelCard({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <Card className="mt-6 flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-muted">{t('home.noChannel')}</p>
      <Button variant="primary" onClick={onCreate}>
        <Icon name="sparkles" size={16} />
        {t('home.createChannel')}
      </Button>
    </Card>
  );
}
