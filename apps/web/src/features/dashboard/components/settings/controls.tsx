import { useI18n } from '@/i18n';
import { Button } from '@/ui';

/** The save button every settings block ends with — one place, so they stay identical. */
export function SaveRow({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex justify-end">
      <Button variant="primary" onClick={onClick}>
        {t('dash.save')}
      </Button>
    </div>
  );
}
