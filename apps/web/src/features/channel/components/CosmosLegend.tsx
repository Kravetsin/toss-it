import { useI18n } from '@/i18n';
import { StarMark } from '@/components/StarMark';

/**
 * Подпись к «космосу» канала: называет смысл фоновых звёзд — каждая звезда это
 * показанная на стриме отправка. Без неё фон читается просто как декор; чип даёт
 * число и связывает мерцающие звёзды с историей канала. Скрыт при пустом космосе.
 */
export function CosmosLegend({ count, className = '' }: { count: number; className?: string }) {
  const { t, lang } = useI18n();
  if (count <= 0) return null;
  const n = new Intl.NumberFormat(lang).format(count);
  return (
    <span
      title={t('channel.cosmosLegendHint')}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm text-muted ${className}`}
    >
      <StarMark size={13} className="text-accent" />
      {t('channel.cosmosLegend', { n })}
    </span>
  );
}
