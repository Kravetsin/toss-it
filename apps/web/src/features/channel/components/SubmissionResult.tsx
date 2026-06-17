import type { LiveStatus } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon, type IconName } from '@/ui/icons';
import { Button, Card } from '@/ui';

const STATUS_META: Record<LiveStatus, { icon: IconName; tone: 'ok' | 'warn' | 'danger' }> = {
  pending: { icon: 'clock', tone: 'warn' },
  approved: { icon: 'check', tone: 'ok' },
  playing: { icon: 'monitor', tone: 'ok' },
  played: { icon: 'check', tone: 'ok' },
  rejected: { icon: 'close', tone: 'danger' },
  expired: { icon: 'clock', tone: 'warn' },
};
const TONE_TEXT = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' } as const;
const TONE_BADGE = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger',
} as const;

/** Итог отправки: иконка статуса + подпись + кнопка «отправить ещё». */
export function SubmissionResult({ status, onReset }: { status: LiveStatus; onReset: () => void }) {
  const { t } = useI18n();
  const meta = STATUS_META[status];
  return (
    <Card className="flex flex-col items-center gap-5 py-8 text-center">
      <span
        className={`inline-grid size-16 place-items-center rounded-full ${TONE_BADGE[meta.tone]}`}
      >
        <Icon name={meta.icon} size={32} />
      </span>
      <p className={`label-mono ${TONE_TEXT[meta.tone]}`}>{t(`status.${status}`)}</p>
      <Button variant="primary" onClick={onReset}>
        <Icon name="send" size={16} />
        {t('channel.send')}
      </Button>
    </Card>
  );
}
