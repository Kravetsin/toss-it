import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { MeResponse, PublicChannelInfo, UploadResponse } from '@tmw/shared';
import { getChannel, getMe, uploadMediaWithProgress } from '../api';
import { Alert, Avatar, Button, Card, ProgressBar } from '../ui';

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,audio/*';

type Phase =
  | { name: 'idle' }
  | { name: 'uploading'; progress: number | null }
  | { name: 'done'; result: UploadResponse }
  | { name: 'error'; message: string };

export function ChannelPage() {
  const { login = '' } = useParams();
  const [channel, setChannel] = useState<PublicChannelInfo | null | 'loading'>('loading');
  const [me, setMe] = useState<MeResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'idle' });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getChannel(login).then(setChannel).catch(() => setChannel(null));
    void getMe().then(setMe).catch(() => setMe(null));
  }, [login]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pickFile = useCallback(
    (f: File | null) => {
      if (!f || channel === 'loading' || !channel) return;
      if (f.size > channel.maxFileSizeBytes) {
        setPhase({
          name: 'error',
          message: `Файл слишком большой: лимит канала ${mb(channel.maxFileSizeBytes)} МБ`,
        });
        return;
      }
      setPhase({ name: 'idle' });
      setFile(f);
    },
    [channel],
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
      setPhase({ name: 'done', result });
      setFile(null);
    } catch (err) {
      setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  if (channel === 'loading') {
    return <Shell>Загрузка…</Shell>;
  }
  if (!channel) {
    return (
      <Shell>
        <h1 className="text-2xl font-bold">Канал не найден</h1>
        <p className="mt-2 text-muted">
          Канала <code className="rounded bg-surface-2 px-1">{login}</code> не существует.
        </p>
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
          <p className="text-sm text-muted">Отправь медиа — оно появится на стриме</p>
        </div>
      </div>

      {/* Лимиты канала */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
        <span className="rounded-full bg-surface-2 px-3 py-1">
          🎬 видео/фото до {fmtDur(channel.maxDurationMs)}
        </span>
        <span className="rounded-full bg-surface-2 px-3 py-1">
          🎵 аудио до {fmtDur(channel.maxAudioDurationMs)}
        </span>
        <span className="rounded-full bg-surface-2 px-3 py-1">📦 до {mb(channel.maxFileSizeBytes)} МБ</span>
      </div>

      <div className="mt-6">
        {!channel.accepting ? (
          <Alert tone="warn">⛔ Стример приостановил приём отправок — загляни позже.</Alert>
        ) : !me?.user ? (
          <Card className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="text-muted">Чтобы отправлять медиа, нужно войти через Twitch</p>
            <a href={`/api/auth/login?returnTo=/c/${encodeURIComponent(login)}`}>
              <Button variant="primary">Войти через Twitch</Button>
            </a>
          </Card>
        ) : (
          <>
            {/* Зона выбора файла */}
            {!file && phase.name !== 'uploading' && (
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
                <p className="font-medium">Перетащи файл сюда или нажми, чтобы выбрать</p>
                <p className="text-xs text-muted">
                  Отправляешь как <b className="text-text">{me.user.displayName}</b>
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}

            {/* Превью перед отправкой */}
            {file && phase.name !== 'uploading' && (
              <Card className="flex flex-col gap-4">
                <FilePreview file={file} url={previewUrl} />
                <p className="text-sm text-muted">
                  {file.name} · {mb(file.size, 1)} МБ
                </p>
                <div className="flex gap-2">
                  <Button variant="primary" className="flex-1" onClick={() => void send()}>
                    🚀 Отправить на стрим
                  </Button>
                  <Button variant="ghost" onClick={() => setFile(null)}>
                    Убрать
                  </Button>
                </div>
              </Card>
            )}

            {/* Прогресс */}
            {phase.name === 'uploading' && (
              <Card className="flex flex-col gap-3">
                <p className="text-sm">
                  {phase.progress === null
                    ? '⚙️ Сервер обрабатывает файл (обрезка и перекодирование)…'
                    : `⬆️ Загрузка: ${Math.round(phase.progress * 100)}%`}
                </p>
                <ProgressBar value={phase.progress} />
              </Card>
            )}

            {/* Результат */}
            {phase.name === 'done' && (
              <div className="mt-4">
                {phase.result.status === 'pending' ? (
                  <Alert tone="warn">
                    🕐 Отправлено! Стример посмотрит и одобрит — после этого медиа попадёт на
                    стрим.
                  </Alert>
                ) : (
                  <Alert tone="ok">
                    🎉 Принято! Позиция в очереди: {phase.result.queuePosition}, на экране
                    будет {Math.round(phase.result.durationMs / 1000)} с.
                  </Alert>
                )}
              </div>
            )}
            {phase.name === 'error' && (
              <div className="mt-4">
                <Alert tone="danger">❌ {phase.message}</Alert>
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
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

/** Миллисекунды → «45 с» / «3 мин» / «3 мин 20 с». */
function fmtDur(ms: number): string {
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} с`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m} мин` : `${m} мин ${s} с`;
}
