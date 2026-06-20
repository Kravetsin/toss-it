import type { ReputationStats } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Tooltip } from '@/ui';
import { StarMark } from '@/components/StarMark';

/**
 * Cross-channel reputation: accepted submissions only (shown on streams as stars).
 * Intentionally hide rejections/bans: negative signals suppress activity more than they improve quality.
 * Star = accepted submission on stream (same currency as channel leaderboard).
 */
export function RepChip({ rep }: { rep?: ReputationStats }) {
  const { t } = useI18n();
  if (!rep) return null;
  return (
    <Tooltip content={t('dash.repAccepted')}>
      <span className="inline-flex w-max items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-muted">
        <StarMark size={12} className="text-accent" />
        {rep.accepted}
      </span>
    </Tooltip>
  );
}
