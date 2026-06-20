import { useI18n } from '@/i18n';
import { Tooltip } from '@/ui';
import { StarMark } from '@/components/StarMark';

/** Label for channel cosmos: connects visible stars (shimmer effects) to sent messages.
 * Without it, background is read as decoration; hidden when count <= 0. */
export function CosmosLegend({ count, className = '' }: { count: number; className?: string }) {
  const { t, lang } = useI18n();
  if (count <= 0) return null;
  const n = new Intl.NumberFormat(lang).format(count);
  return (
    <Tooltip content={t('channel.cosmosLegendHint')} className={className}>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm text-muted">
        <StarMark size={13} className="text-accent" />
        {t('channel.cosmosLegend', { n })}
      </span>
    </Tooltip>
  );
}
