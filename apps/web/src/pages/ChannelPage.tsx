import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { LeaderboardEntry, PublicChannelInfo } from '@tmw/shared';
import { getChannel, getLeaderboard } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { clock } from '@/lib/format';
import { Icon } from '@/ui/icons';
import { Alert, Card, Loader } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { ChannelShell } from '@/features/channel/components/ChannelShell';
import { ChannelHeader } from '@/features/channel/components/ChannelHeader';
import { ComposeForm } from '@/features/channel/components/ComposeForm';
import { Leaderboard } from '@/features/channel/components/Leaderboard';
import { SubmissionResult } from '@/features/channel/components/SubmissionResult';
import { UploadProgress } from '@/features/channel/components/UploadProgress';
import { useMediaSubmission } from '@/features/channel/hooks/useMediaSubmission';

export function ChannelPage() {
  const { t } = useI18n();
  const { login = '' } = useParams();
  const { me } = useMe();
  const [channel, setChannel] = useState<PublicChannelInfo | null | 'loading'>('loading');
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);

  const loadBoard = useCallback(() => {
    void getLeaderboard(login)
      .then(setBoard)
      .catch(() => {});
  }, [login]);

  useEffect(() => {
    void getChannel(login)
      .then(setChannel)
      .catch(() => setChannel(null));
    loadBoard();
  }, [login, loadBoard]);

  const loadedChannel = channel !== 'loading' ? channel : null;
  const sub = useMediaSubmission(loadedChannel, login, loadBoard);

  if (channel === 'loading') {
    return (
      <ChannelShell>
        <Loader label={t('common.loading')} />
      </ChannelShell>
    );
  }
  if (!channel) {
    return (
      <ChannelShell>
        <span className="label-mono text-danger">404</span>
        <h1 className="mt-2">{t('channel.notFoundTitle')}</h1>
        <p className="mt-2 text-muted">{t('channel.notFoundBody', { login })}</p>
      </ChannelShell>
    );
  }

  return (
    <ChannelShell>
      <ChannelHeader channel={channel} />

      <div className="mt-6">
        {!channel.accepting ? (
          <Alert tone="warn">
            <Icon name="close" />
            <span>{t('channel.paused')}</span>
          </Alert>
        ) : !me?.user ? (
          <Card className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-muted">{t('channel.loginToSend')}</p>
            <AuthButtons returnTo={`/c/${login}`} />
          </Card>
        ) : sub.cooldownSec > 0 ? (
          <Alert tone="warn">
            <Icon name="clock" />
            <span>{t('channel.cooldown', { time: clock(sub.cooldownSec) })}</span>
          </Alert>
        ) : sub.phase.name === 'done' && sub.status ? (
          <SubmissionResult status={sub.status} onReset={sub.reset} />
        ) : sub.phase.name === 'uploading' ? (
          <UploadProgress progress={sub.phase.progress} />
        ) : (
          <ComposeForm
            file={sub.file}
            previewUrl={sub.previewUrl}
            text={sub.text}
            senderName={me.user.displayName}
            errorMessage={sub.phase.name === 'error' ? sub.phase.message : null}
            onPickFile={sub.pickFile}
            onRemoveFile={sub.removeFile}
            onTextChange={sub.setText}
            onSend={() => void sub.send()}
          />
        )}
      </div>

      <Leaderboard board={board} meId={me?.user?.id ?? null} />
    </ChannelShell>
  );
}
