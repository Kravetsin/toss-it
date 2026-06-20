import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { LeaderboardEntry, PublicChannelInfo } from '@tmw/shared';
import { getChannel, getLeaderboard } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Alert, Card, Loader } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { populateCosmos } from '@/components/BackgroundStars';
import { flyStardust } from '@/lib/stardustFx';
import { ChannelShell } from '@/features/channel/components/ChannelShell';
import { ChannelHeader } from '@/features/channel/components/ChannelHeader';
import { ComposeForm } from '@/features/channel/components/ComposeForm';
import { Leaderboard } from '@/features/channel/components/Leaderboard';
import { Vessel } from '@/features/channel/components/Vessel/Vessel';
import { useMediaSubmission } from '@/features/channel/hooks/useMediaSubmission';

export function ChannelPage() {
  const { t } = useI18n();
  const { login = '' } = useParams();
  const { me, refresh } = useMe();
  const [channel, setChannel] = useState<PublicChannelInfo | null | 'loading'>('loading');
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const composeRef = useRef<HTMLDivElement>(null);
  const firedRef = useRef<string | null>(null);

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

  // On mount: populate sky with stars based on total visible posts from all contributors.
  // Channel cosmos incentivizes quality submissions. Stars animate in with fade/twinkle.
  // Run once to avoid duplication with session stars.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    void getLeaderboard(login)
      .then((b) => {
        if (cancelled) return;
        const total = b.reduce((sum, e) => sum + e.count, 0);
        if (total > 0) timer = window.setTimeout(() => populateCosmos(total), 500);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [login]);

  const loadedChannel = channel !== 'loading' ? channel : null;
  const sub = useMediaSubmission(loadedChannel, login, loadBoard);

  // On successful submission: animate stardust fragment to sender's wallet, update balance, refresh user state.
  useEffect(() => {
    if (sub.phase.name !== 'done') return;
    const res = sub.phase.result;
    if (firedRef.current === res.id) return;
    firedRef.current = res.id;
    const r = composeRef.current?.getBoundingClientRect();
    const from = r
      ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight * 0.7 };
    flyStardust(from, res.stardustBalance);
    void refresh();
  }, [sub.phase, refresh]);

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

      <div className="mt-6" ref={composeRef}>
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
        ) : (
          <Vessel phase={sub.phase} status={sub.status} cooldownSec={sub.cooldownSec}>
            <ComposeForm
              file={sub.file}
              previewUrl={sub.previewUrl}
              text={sub.text}
              senderName={me.user.displayName}
              errorMessage={sub.phase.name === 'error' ? sub.phase.message : null}
              cooldownSec={sub.cooldownSec}
              onPickFile={sub.pickFile}
              onRemoveFile={sub.removeFile}
              onTextChange={sub.setText}
              onSend={() => void sub.send()}
            />
          </Vessel>
        )}
      </div>

      <Leaderboard board={board} meId={me?.user?.id ?? null} />
    </ChannelShell>
  );
}
