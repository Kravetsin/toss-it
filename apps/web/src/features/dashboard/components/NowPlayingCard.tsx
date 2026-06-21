import { useState, type FormEvent } from 'react';
import type { SubmissionSummary } from '@tmw/shared';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Button, Card } from '@/ui';
import { PlatformIcon } from '@/components/UserMarks';
import { formatTrackDuration } from '../constants';

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
  const [testOpen, setTestOpen] = useState(false);

  async function submitTest(e: FormEvent) {
    e.preventDefault();
    if (!testFile) return;
    await onSendTest(testFile);
    setTestFile(null);
    setTestOpen(false);
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="label-mono text-muted">{t('dash.nowPlaying')}</h2>
          {now ? (
            <div className="mt-1 flex items-center gap-1.5 text-sm text-muted">
              <b
                className="truncate text-text"
                style={now.senderColor ? { color: now.senderColor } : undefined}
              >
                {now.senderName ?? t('common.anon')}
              </b>
              <PlatformIcon userId={now.senderUserId} size={13} />
              <span className="truncate">
                · {now.kind === 'youtube' ? 'YouTube' : now.mime} ·{' '}
                {formatTrackDuration(now.kind, now.durationMs, t)}
              </span>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">{t('dash.nothingPlaying')}</p>
          )}
        </div>
        {now && (
          <Button variant="danger" size="sm" className="shrink-0" onClick={onSkip}>
            <Icon name="forward" size={16} />
            {t('dash.skip')}
          </Button>
        )}
      </div>

      {isOwner && (
        <div className="mt-3 border-t border-border pt-3">
          {testOpen ? (
            <form
              onSubmit={(e) => void submitTest(e)}
              className="flex flex-wrap items-center gap-2"
            >
              <input
                type="file"
                accept="image/*,video/mp4,video/webm,audio/*"
                onChange={(e) => setTestFile(e.target.files?.[0] ?? null)}
                className="min-w-0 flex-1 text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-none file:border file:border-border file:bg-surface-2 file:px-3 file:py-2 file:label-mono file:text-text hover:file:border-border-strong"
              />
              <Button type="submit" size="sm" disabled={!testFile}>
                <Icon name="send" size={16} />
                {t('dash.testSend')}
              </Button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setTestOpen(true)}
              className="flex cursor-pointer items-center gap-1.5 label-mono text-muted outline-none transition-colors duration-[var(--dur-fast)] ease-out hover:text-text focus-visible:text-text"
            >
              <Icon name="send" size={14} />
              {t('dash.testSend')}
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
