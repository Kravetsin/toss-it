import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { DUST_POINTS, type PublicChannelInfo } from '@tmw/shared';
import { getChannel, getLeaderboard } from '@/lib/api';
import { useMe } from '@/hooks/useMe';
import { useI18n } from '@/i18n';
import { Icon } from '@/ui/icons';
import { Alert, Card, Loader } from '@/ui';
import { AuthButtons } from '@/components/AuthButtons';
import { populateCosmos } from '@/components/BackgroundStars';
import { flyStardust } from '@/lib/stardustFx';
import { useShop } from '@/providers/ShopProvider';
import { ChannelShell } from '@/features/channel/components/ChannelShell';
import { ChannelHeader } from '@/features/channel/components/ChannelHeader';
import { ComposeForm } from '@/features/channel/components/ComposeForm';
import { Leaderboard } from '@/features/channel/components/Leaderboard';
import { Vessel } from '@/features/channel/components/Vessel/Vessel';
import { useMediaSubmission } from '@/features/channel/hooks/useMediaSubmission';
import { useChannelTheme, useThemePreviewListener } from '@/features/channel/hooks/useChannelTheme';
import { themeFromQuery, IS_THEME_PREVIEW } from '@/features/channel/lib/themeQuery';

export function ChannelPage() {
  const { t } = useI18n();
  const { login = '' } = useParams();
  const { me, refresh } = useMe();
  const [channel, setChannel] = useState<PublicChannelInfo | null | 'loading'>('loading');
  // Embedded live preview (the dashboard theme constructor): the parent drives the theme via
  // postMessage; otherwise the page owns its own saved theme. The listener re-renders this page on
  // each update so the Vessel (which reads tokens at render) repaints with the rest.
  const preview = IS_THEME_PREVIEW;
  useThemePreviewListener(preview, themeFromQuery());
  useChannelTheme(preview ? null : typeof channel === 'object' ? channel?.theme : null);
  // Leaderboard fetches itself (tabs/periods); the key just tells it "you sent something".
  const [boardRefresh, setBoardRefresh] = useState(0);
  const composeRef = useRef<HTMLDivElement>(null);
  const firedRef = useRef<string | null>(null);
  const { openShop } = useShop();
  const [firstSendHint, setFirstSendHint] = useState(false);

  const bumpBoard = useCallback(() => setBoardRefresh((k) => k + 1), []);

  useEffect(() => {
    void getChannel(login)
      .then(setChannel)
      .catch(() => setChannel(null));
  }, [login]);

  // On mount: populate sky with stars based on total visible posts from all contributors.
  // Channel cosmos incentivizes quality submissions. Stars animate in with fade/twinkle.
  // Run once to avoid duplication with session stars.
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    void getLeaderboard(login)
      .then((b) => {
        if (cancelled) return;
        const total = b.reduce((sum, e) => sum + e.value, 0);
        if (total > 0) timer = window.setTimeout(() => populateCosmos(total), 500);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [login]);

  const loadedChannel = channel !== 'loading' ? channel : null;
  const sub = useMediaSubmission(loadedChannel, login, bumpBoard);

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
    // One-off stardust explainer AFTER the first successful send — never before it
    // (nothing may slow the first send down), and never again after dismissal.
    if (!localStorage.getItem('tossit-first-send-hint')) {
      localStorage.setItem('tossit-first-send-hint', '1');
      setFirstSendHint(true);
    }
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
    <ChannelShell viewerLevel={channel.viewerLevel} pageBackground={channel.pageBackground}>
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
            <AuthButtons returnTo={`/c/${login}`} dustHint />
          </Card>
        ) : (
          <>
            {firstSendHint && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-[var(--radius)] border border-accent/40 bg-accent-soft/40 px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-text">
                  <Icon name="sparkles" size={16} className="shrink-0 text-accent" />
                  {/* Reuse the one moment the moat already allows for shop talk (right after the
                      first send, never before it) to also name what a Twitch-less account misses. */}
                  {t(me.user.hasTwitch ? 'channel.firstSendHint' : 'channel.firstSendHintTwitch', {
                    n: DUST_POINTS.send,
                  })}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setFirstSendHint(false);
                      openShop();
                    }}
                    className="cursor-pointer label-mono text-accent underline decoration-dotted underline-offset-4"
                  >
                    {t('channel.firstSendHintCta')}
                  </button>
                  <button
                    type="button"
                    aria-label={t('common.close')}
                    onClick={() => setFirstSendHint(false)}
                    className="cursor-pointer p-1 text-muted hover:text-text"
                  >
                    <Icon name="close" size={14} />
                  </button>
                </span>
              </div>
            )}
            <Vessel
              phase={sub.phase}
              status={sub.status}
              cooldownSec={sub.cooldownSec}
              cooldownWindowSec={sub.cooldownWindowSec}
            >
              <ComposeForm
                file={sub.file}
                gif={sub.gif}
                gifAutoApprove={loadedChannel?.autoApproveGifs ?? true}
                previewUrl={sub.previewUrl}
                text={sub.text}
                senderName={me.user.displayName}
                errorMessage={sub.phase.name === 'error' ? sub.phase.message : null}
                cooldownSec={sub.cooldownSec}
                voice={sub.voice}
                voices={channel.ttsEnabled ? sub.availableVoices : undefined}
                onVoiceChange={sub.setVoice}
                onPickFile={sub.pickFile}
                onRemoveFile={sub.removeFile}
                onPickGif={sub.pickGif}
                onRemoveGif={sub.removeGif}
                onTextChange={sub.setText}
                onSend={() => void sub.send()}
              />
            </Vessel>
          </>
        )}
      </div>

      <Leaderboard login={login} meId={me?.user?.id ?? null} refreshKey={boardRefresh} />
    </ChannelShell>
  );
}
