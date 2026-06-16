import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  TEXT_MAX_LEN,
  type LeaderboardEntry,
  type LiveStatus,
  type MeResponse,
  type PublicChannelInfo,
  type SubmissionStatusEvent,
  type UploadResponse,
} from '@tmw/shared';
import { ApiRequestError, getChannel, getLeaderboard, getMe, uploadMediaWithProgress } from '../api';
import { Icon, type IconName } from '../icons';
import { formatDuration, useI18n } from '../i18n';
import { Alert, Avatar, Badge, Button, Card, Loader, ProgressBar } from '../ui';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/*';

const STATUS_META: Record<LiveStatus, { icon: IconName; tone: 'ok' | 'warn' | 'danger' }> = {
  pending: { icon: 'clock', tone: 'warn' },
  approved: { icon: 'check', tone: 'ok' },
  playing: { icon: 'monitor', tone: 'ok' },
  played: { icon: 'check', tone: 'ok' },
  rejected: { icon: 'close', tone: 'danger' },
  expired: { icon: 'clock', tone: 'warn' },
};
const TONE_TEXT = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' } as const;

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
  const [text, setText] = useState('');
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

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = window.setInterval(() => setCooldownSec((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [cooldownSec]);

  const doneId = phase.name === 'done' ? phase.result.id : null;
  useEffect(() => {
    if (!doneId) return;
    const socket = io({ query: { role: 'viewer', submission: doneId } });
    socket.on('submission:status', (e: SubmissionStatusEvent) => {
      setLiveStatus(e.status);
      if (e.status === 'played') loadBoard();
    });
    return () => {
      socket.close();
    };
  }, [doneId, loadBoard]);

  const pickFile = useCallback(
    (f: File | null) => {
      if (!f || channel === 'loading' || !channel) return;
      if (f.size > channel.maxFileSizeBytes) {
        setPhase({ name: 'error', message: t('channel.tooBig', { mb: mb(channel.maxFileSizeBytes) }) });
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
    if (!file && !text.trim()) return;
    setPhase({ name: 'uploading', progress: 0 });
    try {
      const result = await uploadMediaWithProgress(login, file, text, (progress) =>
        setPhase({ name: 'uploading', progress }),
      );
      setLiveStatus(result.status);
      setPhase({ name: 'done', result });
      setFile(null);
      setText('');
    } catch (err) {
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
    setText('');
  }

  if (channel === 'loading')
    return (
      <Shell>
        <Loader label={t('common.loading')} />
      </Shell>
    );
  if (!channel) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">{t('channel.notFoundTitle')}</h1>
        <p className="mt-2 text-muted">{t('channel.notFoundBody', { login })}</p>
      </Shell>
    );
  }

  const status = liveStatus ?? (phase.name === 'done' ? phase.result.status : null);
  // Если в тексте есть YouTube-ссылка и нет файла — покажем превью ролика.
  const ytId = file ? null : youtubeIdFromText(text);

  return (
    <Shell>
      {/* Шапка канала */}
      <div className="flex items-center gap-4">
        <Avatar url={channel.avatarUrl} name={channel.displayName} size={56} />
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{channel.displayName}</h1>
            {channel.isFounder && (
              <Badge>
                <Icon name="sparkles" size={12} />
                {t('badge.founder')}
              </Badge>
            )}
          </div>
          <p className="text-muted">{t('channel.subtitle')}</p>
        </div>
      </div>

      {/* Лимиты канала */}
      <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted">
        <Chip icon="image" text={t('channel.limitVideo', { dur: formatDuration(channel.maxDurationMs, t) })} />
        <Chip icon="volume-2" text={t('channel.limitAudio', { dur: formatDuration(channel.maxAudioDurationMs, t) })} />
        <Chip icon="save" text={t('channel.limitSize', { mb: mb(channel.maxFileSizeBytes) })} />
        <Chip icon="send" text={t('channel.limitText', { n: TEXT_MAX_LEN })} />
      </div>

      <div className="mt-6">
        {!channel.accepting ? (
          <Alert tone="warn">
            <Icon name="close" />
            <span>{t('channel.paused')}</span>
          </Alert>
        ) : !me?.user ? (
          <Card className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-muted">{t('channel.loginToSend')}</p>
            <div className="flex flex-col items-center gap-2">
              <a href={`/api/auth/login?returnTo=/c/${encodeURIComponent(login)}`}>
                <Button variant="primary">{t('common.loginTwitch')}</Button>
              </a>
              <a href={`/api/auth/google/login?returnTo=/c/${encodeURIComponent(login)}`}>
                <Button>{t('common.loginGoogle')}</Button>
              </a>
            </div>
          </Card>
        ) : cooldownSec > 0 ? (
          <Alert tone="warn">
            <Icon name="clock" />
            <span>{t('channel.cooldown', { time: clock(cooldownSec) })}</span>
          </Alert>
        ) : phase.name === 'done' && status ? (
          <Card className="flex flex-col items-center gap-4 py-8 text-center">
            <Icon name={STATUS_META[status].icon} size={44} className={TONE_TEXT[STATUS_META[status].tone]} />
            <p className={`text-xl ${TONE_TEXT[STATUS_META[status].tone]}`}>{t(`status.${status}`)}</p>
            <Button variant="primary" onClick={reset}>
              <Icon name="send" size={16} />
              {t('channel.send')}
            </Button>
          </Card>
        ) : phase.name === 'uploading' ? (
          <Card className="flex flex-col gap-3">
            <p className="flex items-center gap-2">
              <Icon name={phase.progress === null ? 'loader' : 'upload'} size={18} />
              {phase.progress === null
                ? t('channel.processing')
                : t('channel.uploading', { pct: Math.round(phase.progress * 100) })}
            </p>
            <ProgressBar value={phase.progress} />
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {file ? (
              <Card className="flex flex-col gap-3">
                <FilePreview file={file} url={previewUrl} />
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm text-muted">
                    {file.name} · {mb(file.size, 1)} MB
                  </p>
                  <button
                    onClick={() => setFile(null)}
                    className="shrink-0 cursor-pointer text-sm text-muted hover:text-danger"
                  >
                    {t('channel.removeFile')}
                  </button>
                </div>
              </Card>
            ) : (
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`flex cursor-pointer flex-col items-center gap-3 rounded-none border-[3px] border-dashed px-6 py-10 text-center transition-colors ${
                  dragOver ? 'border-twitch bg-twitch/10' : 'border-line bg-surface hover:border-twitch-light/60'
                }`}
              >
                <Icon name="folder-plus" size={40} className="text-twitch-light" />
                <p className="font-display text-lg">{t('channel.dropzone')}</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}

            {!file && ytId && (
              <Card className="flex flex-col items-start gap-2">
                <img
                  src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
                  className="max-h-60 w-full rounded-none bg-black/40 object-contain"
                />
                <p className="flex items-center gap-1.5 text-sm text-muted">
                  <Icon name="play" size={15} className="text-twitch-light" />
                  YouTube
                </p>
              </Card>
            )}

            <div>
              <textarea
                value={text}
                maxLength={TEXT_MAX_LEN}
                rows={3}
                onChange={(e) => setText(e.target.value)}
                placeholder={file ? t('channel.captionPlaceholder') : t('channel.textPlaceholder')}
                className="w-full resize-none rounded-none border-2 border-line bg-surface px-3 py-2 text-text outline-none focus:border-twitch"
              />
              <div className="mt-1 flex justify-between text-xs text-muted">
                <span>{t('channel.sendingAs', { name: me.user.displayName })}</span>
                <span>
                  {text.length}/{TEXT_MAX_LEN}
                </span>
              </div>
            </div>

            <Button
              variant="primary"
              className="justify-center"
              disabled={!file && !text.trim()}
              onClick={() => void send()}
            >
              <Icon name="send" size={16} />
              {t('channel.send')}
            </Button>

            {phase.name === 'error' && (
              <Alert tone="danger">
                <Icon name="close" />
                <span>{phase.message}</span>
              </Alert>
            )}
          </div>
        )}
      </div>

      <Leaderboard board={board} meId={me?.user?.id ?? null} />
    </Shell>
  );
}

function Chip({ icon, text }: { icon: IconName; text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-none border-2 border-line bg-surface-2 px-3 py-1">
      <Icon name={icon} size={15} className="text-muted" />
      {text}
    </span>
  );
}

function Leaderboard({ board, meId }: { board: LeaderboardEntry[]; meId: string | null }) {
  const { t } = useI18n();
  return (
    <div className="mt-8">
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <Icon name="trophy" size={22} className="text-warn" />
        {t('channel.leaderboard')}
      </h2>
      {board.length === 0 ? (
        <p className="text-muted">{t('channel.leaderboardEmpty')}</p>
      ) : (
        <Card>
          <ol className="flex flex-col gap-1.5">
            {board.map((e, i) => {
              const isYou = e.userId === meId;
              return (
                <li key={e.userId} className={`flex items-center gap-3 px-2 py-1 ${isYou ? 'bg-twitch/15' : ''}`}>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center border-2 font-display text-sm ${
                      i < 3 ? 'border-twitch-dark bg-twitch text-white' : 'border-line text-muted'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <b className={isYou ? 'text-twitch-light' : 'text-text'}>{e.displayName}</b>
                  {isYou && <span className="text-sm text-twitch-light">({t('channel.you')})</span>}
                  <span className="ml-auto flex items-center gap-1.5 text-muted">
                    <Icon name="image" size={15} />
                    {e.count}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}
    </div>
  );
}

function FilePreview({ file, url }: { file: File; url: string | null }) {
  if (!url) return null;
  const cls = 'max-h-72 w-full rounded-none object-contain bg-black/40 [image-rendering:auto]';
  if (file.type.startsWith('image/')) return <img src={url} className={cls} />;
  if (file.type.startsWith('video/')) return <video src={url} controls muted className={cls} />;
  if (file.type.startsWith('audio/')) return <audio src={url} controls className="w-full" />;
  return null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-10">
      {/* Бренд-ссылка на главную: зритель может уйти к себе — залогиниться и создать свой канал. */}
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 text-muted transition-colors hover:text-text"
      >
        <img src="/favicon.svg" alt="Tossit" width={24} height={24} />
        <span className="font-display text-sm uppercase tracking-wide">Tossit</span>
      </Link>
      {children}
      <p className="mt-10 text-center text-xs text-muted/60">Tossit</p>
    </main>
  );
}

/** Достаёт id ролика из YouTube-ссылки в тексте (для клиентского превью). */
function youtubeIdFromText(text: string): string | null {
  const m = text.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{11})/i,
  );
  return m?.[1] ?? null;
}

function mb(bytes: number, digits = 0): string {
  return (bytes / 1024 / 1024).toFixed(digits);
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
