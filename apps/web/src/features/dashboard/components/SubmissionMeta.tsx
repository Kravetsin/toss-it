import type { SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { KIND_ICON, formatTrackDuration } from '../constants';

/** Шапка карточки отправки: иконка типа + имя отправителя + бейдж «доверенный» + длительность/время. */
export function SubmissionMeta({ s, trusted }: { s: SubmissionSummary; trusted: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-sm">
        <Icon name={KIND_ICON[s.kind]} size={15} className="shrink-0 text-muted" />
        <b className="truncate text-text">{s.senderName ?? t('common.anon')}</b>
        {trusted && (
          <span className="shrink-0 border border-ok/40 bg-ok/15 px-1.5 py-0.5 text-xs text-ok">
            {t('dash.trusted')}
          </span>
        )}
      </span>
      <span className="shrink-0 whitespace-nowrap text-xs text-muted">
        {formatTrackDuration(s.kind, s.durationMs, t)} · {new Date(s.createdAt).toLocaleTimeString()}
      </span>
    </div>
  );
}
