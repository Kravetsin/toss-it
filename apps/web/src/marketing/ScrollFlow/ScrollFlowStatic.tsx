import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { STAGE_ICONS } from './engine';

/** Статичная полоса этапов для prefers-reduced-motion (без анимации). */
export function ScrollFlowStatic({ stages }: { stages: { name: string; cap: string }[] }) {
  const { t } = useI18n();
  return (
    <section className="py-8">
      <p className="mb-5 text-center font-display text-xs uppercase tracking-wide text-muted">
        {t('flow.title')}
      </p>
      <div className="mx-auto flex max-w-2xl flex-wrap items-start justify-center gap-x-6 gap-y-4 px-4">
        {STAGE_ICONS.map((name, i) => (
          <div key={name} className="flex w-28 flex-col items-center text-center">
            <Icon name={name} size={30} className="text-twitch-light" />
            <span className="mt-2 font-body text-sm text-text">{stages[i]!.name}</span>
            <span className="text-xs text-muted">{stages[i]!.cap}</span>
            {/* Модерация — это развилка: одобрить ✓ / отклонить ✕ / свой без проверки ★. */}
            {i === 2 && (
              <span className="mt-1 flex gap-1.5">
                <Icon name="check" size={16} className="text-ok" />
                <Icon name="close" size={16} className="text-danger" />
                <Icon name="star" size={16} className="text-warn" />
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
