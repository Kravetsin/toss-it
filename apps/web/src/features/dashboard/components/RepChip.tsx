import type { ReputationStats } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Badge } from '@/ui';

/** Кросс-канальная репутация отправителя: бейдж founder · ✓принято · ✗отклонено · WL · BAN (или «новичок»). */
export function RepChip({ rep }: { rep?: ReputationStats }) {
  const { t } = useI18n();
  if (!rep) return null;
  // Бейдж первопроходца — независимо от счётчиков (виден и у новичков).
  const founder = rep.isFounder ? (
    <Badge>
      <Icon name="sparkles" size={11} />
      {t('badge.founder')}
    </Badge>
  ) : null;
  if (rep.accepted === 0 && rep.rejected === 0) {
    return (
      <span className="flex items-center gap-2">
        {founder}
        <span className="inline-flex w-max items-center rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-xs text-accent">
          {t('dash.repNew')}
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
      {founder}
      <span className="flex items-center gap-1 text-ok" title={t('dash.repAccepted')}>
        <Icon name="check" size={12} />
        {rep.accepted}
      </span>
      <span className="flex items-center gap-1" title={t('dash.repRejected')}>
        <Icon name="close" size={12} />
        {rep.rejected}
      </span>
      <span className="h-3 w-px bg-border" aria-hidden="true" />
      <span className="flex items-center gap-1" title={t('dash.repWhitelisted')}>
        <Icon name="star" size={12} />
        {rep.whitelistedChannels}
      </span>
      <span
        className={`flex items-center gap-1 ${rep.bannedChannels > 0 ? 'text-danger' : ''}`}
        title={t('dash.repBanned')}
      >
        <Icon name="user-x" size={12} />
        {rep.bannedChannels}
      </span>
    </span>
  );
}
