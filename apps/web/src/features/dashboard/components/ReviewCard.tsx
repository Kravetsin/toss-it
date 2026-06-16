import type { ReputationStats, SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card } from '@/ui';
import { KIND_ICON } from '../constants';
import { RepChip } from './RepChip';
import { SubmissionMeta } from './SubmissionMeta';
import { SubmissionPreview } from './SubmissionPreview';

function Kbd({ k }: { k: string }) {
  return <span className="ml-1 border border-line px-1 text-xs normal-case text-muted">{k}</span>;
}

/** Фокус-карточка разбора: одна заявка крупно + кнопки с хоткеями + «дальше». */
export function ReviewCard({
  cur,
  rest,
  next,
  trusted,
  rep,
  onApprove,
  onTrust,
  onReject,
  onBan,
  onLater,
}: {
  cur: SubmissionSummary;
  rest: number;
  next: SubmissionSummary[];
  trusted: boolean;
  rep?: ReputationStats;
  onApprove: () => void;
  onTrust: () => void;
  onReject: () => void;
  onBan: () => void;
  onLater: () => void;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <SubmissionMeta s={cur} trusted={trusted} />
      {rep && (
        <div className="mt-1.5">
          <RepChip rep={rep} />
        </div>
      )}
      <div className="mt-3">
        <SubmissionPreview s={cur} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onApprove}>
          <Icon name="check" size={16} />
          {t('dash.approve')}
          <Kbd k="Space" />
        </Button>
        <Button onClick={onTrust}>
          <Icon name="star" size={16} className="text-twitch-light" />
          {t('dash.approveWhitelist')}
          <Kbd k="W" />
        </Button>
        <Button onClick={onLater}>
          <Icon name="clock" size={16} />
          {t('dash.later')}
          <Kbd k="↓" />
        </Button>
        <Button className="ml-auto" onClick={onReject}>
          <Icon name="close" size={16} />
          {t('dash.reject')}
          <Kbd k="R" />
        </Button>
        <Button className="hover:border-danger hover:text-danger" onClick={onBan}>
          <Icon name="user-x" size={16} className="text-danger" />
          {t('dash.ban')}
          <Kbd k="B" />
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span>{t('dash.next')}:</span>
        {next.map((n) => (
          <span
            key={n.id}
            title={n.senderName ?? ''}
            className="flex h-7 w-7 items-center justify-center border-2 border-line bg-surface-2"
          >
            <Icon name={KIND_ICON[n.kind]} size={14} />
          </span>
        ))}
        {rest > next.length && <span>+{rest - next.length}</span>}
      </div>
      <p className="mt-3 text-xs text-muted/70">{t('dash.hotkeyHint')}</p>
    </Card>
  );
}
