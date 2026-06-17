import { useState } from 'react';
import type { ReputationStats, SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Badge } from '@/ui';
import { useQueueHotkeys } from '../hooks/useQueueHotkeys';
import { SubmissionCard } from './SubmissionCard';

/** Очередь модерации: единый список со свайпом (→ одобрить, ← отклонить) и разворотом строки. */
export function ModerationQueue({
  pending,
  reputation,
  onApprove,
  onTrust,
  onReject,
  onBan,
}: {
  pending: SubmissionSummary[];
  reputation: Record<string, ReputationStats>;
  onApprove: (s: SubmissionSummary) => void;
  onTrust: (s: SubmissionSummary) => void;
  onReject: (s: SubmissionSummary) => void;
  onBan: (s: SubmissionSummary) => void;
}) {
  const { t } = useI18n();
  const [stats, setStats] = useState({ approved: 0, rejected: 0 });

  const approve = (s: SubmissionSummary) => {
    onApprove(s);
    setStats((p) => ({ ...p, approved: p.approved + 1 }));
  };
  const trust = (s: SubmissionSummary) => {
    onTrust(s);
    setStats((p) => ({ ...p, approved: p.approved + 1 }));
  };
  const reject = (s: SubmissionSummary) => {
    onReject(s);
    setStats((p) => ({ ...p, rejected: p.rejected + 1 }));
  };

  // Хоткеи действуют на голову очереди (Space/W/R/B); жесты — на конкретную строку.
  useQueueHotkeys({
    active: pending.length > 0,
    pending,
    onApprove: approve,
    onTrust: trust,
    onReject: reject,
    onBan,
  });

  return (
    <>
      <div className="mb-3">
        <h2 className="flex items-center gap-2">
          {t('dash.modQueue')}
          {pending.length > 0 && <Badge>{pending.length}</Badge>}
        </h2>
        {pending.length > 0 && <p className="mt-1 text-xs text-faint">{t('dash.swipeHint')}</p>}
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-muted">{t('dash.modEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {pending.map((s) => (
            <SubmissionCard
              key={s.id}
              s={s}
              rep={s.senderUserId ? reputation[s.senderUserId] : undefined}
              onApprove={() => approve(s)}
              onTrust={() => trust(s)}
              onReject={() => reject(s)}
              onBan={() => onBan(s)}
            />
          ))}
        </div>
      )}

      {(stats.approved > 0 || stats.rejected > 0) && (
        <p className="mt-3 text-xs text-muted">
          {t('dash.sessionStats', { a: stats.approved, r: stats.rejected })}
        </p>
      )}
    </>
  );
}
