import { useEffect, useState } from 'react';
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
  // Оптимистично убранные (после действия), чтобы очередь пустела сразу, не дожидаясь сокета.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  // Чистим dismissed от заявок, которых уже нет в pending (реально удалены по сокету/обновлению).
  useEffect(() => {
    setDismissed((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => pending.some((p) => p.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pending]);

  const visible = pending.filter((p) => !dismissed.has(p.id));
  const drop = (id: string) => setDismissed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

  const approve = (s: SubmissionSummary) => {
    onApprove(s);
    setStats((p) => ({ ...p, approved: p.approved + 1 }));
    drop(s.id);
  };
  const trust = (s: SubmissionSummary) => {
    onTrust(s);
    setStats((p) => ({ ...p, approved: p.approved + 1 }));
    drop(s.id);
  };
  const reject = (s: SubmissionSummary) => {
    onReject(s);
    setStats((p) => ({ ...p, rejected: p.rejected + 1 }));
    drop(s.id);
  };

  // Хоткеи действуют на голову видимой очереди (Space/W/R/B); жесты — на конкретную строку.
  useQueueHotkeys({
    active: visible.length > 0,
    pending: visible,
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
          {visible.length > 0 && <Badge>{visible.length}</Badge>}
        </h2>
        {visible.length > 0 && <p className="mt-1 text-xs text-faint">{t('dash.swipeHint')}</p>}
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">{t('dash.modEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((s) => (
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
