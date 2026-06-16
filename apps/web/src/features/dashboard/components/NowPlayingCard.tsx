import { useState, type FormEvent } from 'react';
import type { SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card } from '@/ui';
import { formatTrackDuration } from '../constants';

/** «Сейчас играет» + кнопка скипа + (для владельца) форма тестовой отправки. */
export function NowPlayingCard({
  now,
  isOwner,
  onSkip,
  onSendTest,
}: {
  now: SubmissionSummary | null;
  isOwner: boolean;
  onSkip: () => void;
  onSendTest: (file: File) => void | Promise<void>;
}) {
  const { t } = useI18n();
  const [testFile, setTestFile] = useState<File | null>(null);

  async function submitTest(e: FormEvent) {
    e.preventDefault();
    if (!testFile) return;
    await onSendTest(testFile);
    setTestFile(null);
  }

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2>{t('dash.nowPlaying')}</h2>
          {now ? (
            <p className="mt-1 text-sm text-muted">
              <b className="text-text">{now.senderName ?? t('common.anon')}</b> ·{' '}
              {now.kind === 'youtube' ? 'YouTube' : now.mime} ·{' '}
              {formatTrackDuration(now.kind, now.durationMs, t)}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted">{t('dash.nothingPlaying')}</p>
          )}
        </div>
        {now && (
          <Button variant="danger" className="shrink-0" onClick={onSkip}>
            <Icon name="forward" size={16} />
            {t('dash.skip')}
          </Button>
        )}
      </div>
      {isOwner && (
        <form
          onSubmit={(e) => void submitTest(e)}
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4"
        >
          <input
            type="file"
            accept="image/*,video/mp4,video/webm,audio/*"
            onChange={(e) => setTestFile(e.target.files?.[0] ?? null)}
            className="text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-none file:border-2 file:border-line file:bg-surface-2 file:px-3 file:py-1.5 file:font-body file:font-semibold file:text-text"
          />
          <Button type="submit" disabled={!testFile}>
            <Icon name="send" size={16} />
            {t('dash.testSend')}
          </Button>
        </form>
      )}
    </Card>
  );
}
