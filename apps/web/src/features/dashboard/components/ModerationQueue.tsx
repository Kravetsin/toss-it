import { useEffect, useState } from 'react';
import type { ReputationStats, SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Badge, Icon, IconButton } from '@/ui';
import { useQueueHotkeys } from '../hooks/useQueueHotkeys';
import { SubmissionCard } from './SubmissionCard';

/** Moderation queue: single list with swipe gestures (right=approve, left=reject) and row expansion. */
export function ModerationQueue({
  pending,
  reputation,
  onApprove,
  onTrust,
  onReject,
  onBan,
  onOpenSettings,
}: {
  pending: SubmissionSummary[];
  reputation: Record<string, ReputationStats>;
  onApprove: (s: SubmissionSummary) => void;
  onTrust: (s: SubmissionSummary) => void;
  onReject: (s: SubmissionSummary) => void;
  onBan: (s: SubmissionSummary) => void;
  /** Owner-only: opens the moderation-settings modal. Omitted for moderators (no gear shown). */
  onOpenSettings?: () => void;
}) {
  const { t } = useI18n();
  const [stats, setStats] = useState({ approved: 0, rejected: 0 });
  // Optimistically removed items; queue empties immediately, not waiting for socket sync.
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  // Prune dismissed items no longer in pending (deleted via socket/refresh).
  useEffect(() => {
    setDismissed((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set([...prev].filter((id) => pending.some((p) => p.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [pending]);

  const visible = pending.filter((p) => !dismissed.has(p.id));
  const drop = (id: string) =>
    setDismissed((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));

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

  // Hotkeys act on queue head (Space/W/R/B); gestures target specific row.
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
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2">
            {t('dash.modQueue')}
            {visible.length > 0 && <Badge>{visible.length}</Badge>}
          </h2>
          {visible.length > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
              <span className="inline-flex items-center gap-1">
                <Icon name="arrow-right" size={13} className="text-ok" />
                {t('dash.swipeApprove')}
              </span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Icon name="arrow-left" size={13} className="text-danger" />
                {t('dash.swipeReject')}
              </span>
              <span aria-hidden>·</span>
              <span>{t('dash.swipeExpand')}</span>
            </p>
          )}
        </div>
        {onOpenSettings && (
          <IconButton
            name="settings"
            label={t('dash.modSettings')}
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
          />
        )}
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
