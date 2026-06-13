import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import type {
  LeaderboardEntry,
  LiveStatus,
  MeResponse,
  PublicChannelInfo,
  SubmissionStatusEvent,
  UploadResponse,
} from '@tmw/shared';
import { ApiRequestError, getChannel, getLeaderboard, getMe, uploadMediaWithProgress } from '../api';
import { formatDuration, useI18n } from '../i18n';
import { Alert, Avatar, Button, Card, ProgressBar } from '../ui';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/*';

type Phase =
  | { name: 'idle' }
  | { name: 'uploading'; progress: number | null }
  | { name: 'done'; result: UploadResponse }
  | { name: 'error'; message: string };

export function ChannelPage() {
  const { t } = useI18n();
  const { login = '' } = useParams();
  const [channel, setChannel] = useState<PublicChannelInfo | null | 'loading'>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
  const [cooldownSec, setCooldownSec] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadBoard = useCallback(() => {
    void getLeaderboard(login).then(setBoard).catch(() => {});
  }, [login]);

  useEffect(() => {
    void getChannel(login).then(setChannel).catch(() => setChannel(null));
    void getMe().then(setMe).catch(() => setMe(null));
    loadBoard();
  }, [login, loadBoard]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Тикаем обратный отсчёт кулдауна.
  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = window.setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldownSec]);

  // Живой статус отправки: подписываемся на свой сабмишен по WebSocket.
  const doneId = phase.name === 'done' ? phase.result.id : null;
  useEffect(() => {
    if (!doneId) return;
    const socket = io({ query: { role: 'viewer', submission: doneId } });
    socket.on('submission:status', (e: SubmissionStatusEvent) => {
      setLiveStatus(e.status);
      if (e.status === 'played') loadBoard(); // мог измениться топ
    });
    return () => {
      socket.close();
    };
  }, [doneId, loadBoard]);

  const pickFile = useCallback(
    (f: File | null) => {
      if (!f || channel === 'loading' || !channel) return;
      if (f.size > channel.maxFileSizeBytes) {
        setPhase({
          name: 'error',
          message: t('channel.tooBig', { mb: mb(channel.maxFileSizeBytes) }),
        });
        return;
      }
      setPhase({ name: 'idle' });
      setFile(f);
    },
    [channel, t],
  );

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files[0] ?? null);
  }

  async function send() {
    if (!file) return;
    setPhase({ name: 'uploading', progress: 0 });
    try {
      const result = await uploadMediaWithProgress(login, file, (progress) =>
        setPhase({ name: 'uploading', progress }),
      );
      setLiveStatus(result.status);
      setPhase({ name: 'done', result });
      setFile(null);
    } catch (err) {
      // Кулдаун — не ошибка, а ожидание: показываем обратный отсчёт.
      if (err instanceof ApiRequestError && err.code === 'cooldown' && err.retryAfterSec) {
        setCooldownSec(err.retryAfterSec);
        setPhase({ name: 'idle' });
        return;
      }
      setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  function reset() {
    setPhase({ name: 'idle' });
    setLiveStatus(null);
    setFile(null);
  }

  if (channel === 'loading') {
    return <Shell>{t('common.loading')}</Shell>;
  }
  if (!channel) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">{t('channel.notFoundTitle')}</h1>
        <p className="mt-2 text-muted">{t('channel.notFoundBody', { login })}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Шапка канала */}
      <div className="flex items-center gap-4">
        <Avatar url={channel.avatarUrl} name={channel.displayName} size={56} />
        <div>
          <h1 className="text-2xl font-bold">{channel.displayName}</h1>
          <p className="text-sm text-muted">{t('channel.subtitle')}</p>
        </div>
      </div>

      {/* Лимиты канала */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
        <span className="rounded-full bg-surface-2 px-3 py-1">
          {t('channel.limitVideo', { dur: formatDuration(channel.maxDurationMs, t) })}
        </span>
        <span className="rounded-full bg-surface-2 px-3 py-1">
          {t('channel.limitAudio', { dur: formatDuration(channel.maxAudioDurationMs, t) })}
        </span>
        <span className="rounded-full bg-surface-2 px-3 py-1">
          {t('channel.limitSize', { mb: mb(channel.maxFileSizeBytes) })}
        </span>
      </div>

      <div className="mt-6">
        {!channel.accepting ? (
          <Alert tone="warn">{t('channel.paused')}</Alert>
        ) : !me?.user ? (
          <Card className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-muted">{t('channel.loginToSend')}</p>
            <a href={`/api/auth/login?returnTo=/c/${encodeURIComponent(login)}`}>
              <Button variant="primary">{t('common.loginTwitch')}</Button>
            </a>
          </Card>
        ) : cooldownSec > 0 ? (
          <Alert tone="warn">{t('channel.cooldown', { time: clock(cooldownSec) })}</Alert>
        ) : phase.name === 'done' ? (
          <Card className="flex flex-col items-center gap-4 py-8 text-center">
            <p className="text-lg font-semibold">{t(`status.${liveStatus ?? phase.result.status}`)}</p>
            <Button variant="primary" onClick={reset}>
              {t('channel.send')}
            </Button>
          </Card>
        ) : phase.name === 'uploading' ? (
          <Card className="flex flex-col gap-3">
            <p className="text-sm">
              {phase.progress === null
                ? t('channel.processing')
                : t('channel.uploading', { pct: Math.round(phase.progress * 100) })}
            </p>
            <ProgressBar value={phase.progress} />
          </Card>
        ) : file ? (
          <Card className="flex flex-col gap-4">
            <FilePreview file={file} url={previewUrl} />
            <p className="text-sm text-muted">
              {file.name} · {mb(file.size, 1)} MB
            </p>
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => void send()}>
                {t('channel.send')}
              </Button>
              <Button variant="ghost" onClick={() => setFile(null)}>
                {t('channel.removeFile')}
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                dragOver
                  ? 'border-twitch bg-twitch/10'
                  : 'border-line bg-surface hover:border-twitch-light/60'
              }`}
            >
              <span className="text-4xl">📁</span>
              <p className="font-medium">{t('channel.dropzone')}</p>
              <p className="text-xs text-muted">
                {t('channel.sendingAs', { name: me.user.displayName })}
              </p>
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>
            {phase.name === 'error' && (
              <div className="mt-4">
                <Alert tone="danger">❌ {phase.message}</Alert>
              </div>
            )}
          </>
        )}
      </div>

      <Leaderboard board={board} meId={me?.user?.id ?? null} />
    </Shell>
  );
}

function Leaderboard({ board, meId }: { board: LeaderboardEntry[]; meId: string | null }) {
  const { t } = useI18n();
  return (
    <div className="mt-8">
      <h2 className="mb-3 text-lg font-bold">{t('channel.leaderboard')}</h2>
      {board.length === 0 ? (
        <p className="text-sm text-muted">{t('channel.leaderboardEmpty')}</p>
      ) : (
        <Card>
          <ol className="flex flex-col gap-1.5 text-sm">
            {board.map((e, i) => {
              const isYou = e.userId === meId;
              return (
                <li
                  key={e.userId}
                  className={`flex items-center gap-2 rounded px-2 py-1 ${
                    isYou ? 'bg-twitch/15' : ''
                  }`}
                >
                  <span className="w-6 text-center font-bold text-muted">{medal(i)}</span>
                  <b className={isYou ? 'text-twitch-light' : 'text-text'}>{e.displayName}</b>
                  {isYou && <span className="text-xs text-twitch-light">({t('channel.you')})</span>}
                  <span className="ml-auto text-muted">🎬 {e.count}</span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}

function medal(i: number): string {
  return ['🥇', '🥈', '🥉'][i] ?? String(i + 1);
}

function FilePreview({ file, url }: { file: File; url: string | null }) {
  if (!url) return null;
  const cls = 'max-h-72 w-full rounded-lg object-contain bg-black/40';
  if (file.type.startsWith('image/')) return <img src={url} className={cls} />;
  if (file.type.startsWith('video/')) return <video src={url} controls muted className={cls} />;
  if (file.type.startsWith('audio/')) return <audio src={url} controls className="w-full" />;
  return null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-10">
      {children}
      <p className="mt-10 text-center text-xs text-muted/60">Twitch Media Widget</p>
    </main>
  );
}

function mb(bytes: number, digits = 0): string {
  return (bytes / 1024 / 1024).toFixed(digits);
}

/** Секунды → «0:42» для обратного отсчёта. */
function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
