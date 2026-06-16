import { useState } from 'react';
import type { ListedUser, ReputationStats, SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { useQueueHotkeys } from '../hooks/useQueueHotkeys';
import { ReviewCard } from './ReviewCard';
import { SubmissionCard } from './SubmissionCard';

function ViewBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer px-3 py-1 font-body text-sm font-semibold uppercase tracking-wide ${
        active ? 'bg-twitch text-white' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

/** Очередь модерации с двумя видами: «Список» (всё разом) и «Разбор» (по одной + хоткеи). */
export function ModerationQueue({
  pending,
  allowed,
  reputation,
  view,
  onView,
  onApprove,
  onTrust,
  onReject,
  onBan,
  onLater,
}: {
  pending: SubmissionSummary[];
  allowed: ListedUser[];
  reputation: Record<string, ReputationStats>;
  view: 'list' | 'review';
  onView: (v: 'list' | 'review') => void;
  onApprove: (s: SubmissionSummary) => void;
  onTrust: (s: SubmissionSummary) => void;
  onReject: (s: SubmissionSummary) => void;
  onBan: (s: SubmissionSummary) => void;
  onLater: (id: string) => void;
}) {
  const { t } = useI18n();
  const [stats, setStats] = useState({ approved: 0, rejected: 0 });
  const trustedIds = new Set(allowed.map((a) => a.userId));

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

  // Хоткеи активны только в разборе; действуют на голову очереди.
  useQueueHotkeys({
    active: view === 'review',
    pending,
    onApprove: approve,
    onTrust: trust,
    onReject: reject,
    onBan,
    onLater,
  });

  return (
    <>
      <div className="mb-3 mt-8 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2">
          {t('dash.modQueue')}
          {pending.length > 0 && (
            <span className="border-2 border-twitch-dark bg-twitch px-2 py-0.5 text-sm text-white">
              {pending.length}
            </span>
          )}
        </h2>
        <div className="flex gap-1 border-2 border-line bg-surface-2 p-1">
          <ViewBtn active={view === 'list'} onClick={() => onView('list')} label={t('dash.viewList')} />
          <ViewBtn active={view === 'review'} onClick={() => onView('review')} label={t('dash.viewReview')} />
        </div>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-muted">{t('dash.modEmpty')}</p>
      ) : view === 'list' ? (
        <div className="flex flex-col gap-3">
          {pending.map((s) => (
            <SubmissionCard
              key={s.id}
              s={s}
              trusted={!!s.senderUserId && trustedIds.has(s.senderUserId)}
              rep={s.senderUserId ? reputation[s.senderUserId] : undefined}
              onApprove={() => approve(s)}
              onTrust={() => trust(s)}
              onReject={() => reject(s)}
              onBan={() => onBan(s)}
            />
          ))}
        </div>
      ) : (
        (() => {
          const head = pending[0]!;
          return (
            <ReviewCard
              cur={head}
              rest={pending.length - 1}
              next={pending.slice(1, 8)}
              trusted={!!head.senderUserId && trustedIds.has(head.senderUserId)}
              rep={head.senderUserId ? reputation[head.senderUserId] : undefined}
              onApprove={() => approve(head)}
              onTrust={() => trust(head)}
              onReject={() => reject(head)}
              onBan={() => onBan(head)}
              onLater={() => onLater(head.id)}
            />
          );
        })()
      )}

      {(stats.approved > 0 || stats.rejected > 0) && (
        <p className="mt-3 text-xs text-muted">
          {t('dash.sessionStats', { a: stats.approved, r: stats.rejected })}
        </p>
      )}
    </>
  );
}
