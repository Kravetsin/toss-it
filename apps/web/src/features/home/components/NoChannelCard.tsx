import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card } from '@/ui';

/** Онбординг: у пользователя ещё нет канала — предложить создать. */
export function NoChannelCard({ onCreate }: { onCreate: () => void }) {
  const { t } = useI18n();
  return (
    <Card corners className="mt-6 flex flex-col items-center gap-5 py-12 text-center">
      <Icon name="sparkles" size={28} className="text-accent" />
      <p className="max-w-md text-balance text-muted">{t('home.noChannel')}</p>
      <Button variant="primary" onClick={onCreate}>
        <Icon name="sparkles" size={16} />
        {t('home.createChannel')}
      </Button>
    </Card>
  );
}
