import type { ReputationStats } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { StarMark } from '@/components/StarMark';

/**
 * Кросс-канальная репутация отправителя — только «показано на стримах» в виде звёзд.
 * Намеренно НЕ показываем отказы/баны/WL: заградительный сигнал заставляет зрителя
 * дважды подумать перед отправкой и душит активность, а не растит качество. Звезда =
 * показанная на стриме отправка (та же «валюта», что в лидерборде канала). founder-бейдж
 * не дублируем — он уже есть в шапке карточки (UserBadges).
 */
export function RepChip({ rep }: { rep?: ReputationStats }) {
  const { t } = useI18n();
  if (!rep) return null;
  return (
    <span
      className="inline-flex w-max items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-muted"
      title={t('dash.repAccepted')}
    >
      <StarMark size={12} className="text-accent" />
      {rep.accepted}
    </span>
  );
}
