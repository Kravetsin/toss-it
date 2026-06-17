import type { ReputationStats, SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card } from '@/ui';
import { RepChip } from './RepChip';
import { SubmissionMeta } from './SubmissionMeta';
import { SubmissionPreview } from './SubmissionPreview';

/** Карточка отправки в виде «Список»: метаданные + репутация + превью + действия. */
export function SubmissionCard({
  s,
  trusted,
  rep,
  onApprove,
  onTrust,
  onReject,
  onBan,
}: {
  s: SubmissionSummary;
  trusted: boolean;
  rep?: ReputationStats;
  onApprove: () => void;
  onTrust: () => void;
  onReject: () => void;
  onBan: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <SubmissionMeta s={s} trusted={trusted} />
      {rep && (
        <div className="mt-1.5">
          <RepChip rep={rep} />
        </div>
      )}
      <div className="mt-3">
        <SubmissionPreview s={s} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onApprove}>
          <Icon name="check" size={16} />
          {t('dash.approve')}
        </Button>
        <Button onClick={onTrust}>
          <Icon name="star" size={16} className="text-accent" />
          {t('dash.approveWhitelist')}
        </Button>
        <Button className="ml-auto" onClick={onReject}>
          <Icon name="close" size={16} />
          {t('dash.reject')}
        </Button>
        <Button className="hover:border-danger hover:text-danger" onClick={onBan}>
          <Icon name="user-x" size={16} className="text-danger" />
          {t('dash.ban')}
        </Button>
      </div>
    </Card>
  );
}
