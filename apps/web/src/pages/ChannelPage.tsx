import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { MeResponse, PublicChannelInfo, UploadResponse } from '@tmw/shared';
import { getChannel, getMe, uploadMediaWithProgress } from '../api';
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
      setPhase({ name: 'done', result });
      setFile(null);
    } catch (err) {
      setPhase({ name: 'error', message: err instanceof Error ? err.message : String(err) });
    }
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
            )}

            {/* Превью перед отправкой */}
            {file && phase.name !== 'uploading' && (
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
            )}

            {/* Прогресс */}
            {phase.name === 'uploading' && (
              <Card className="flex flex-col gap-3">
                <p className="text-sm">
                  {phase.progress === null
                    ? t('channel.processing')
                    : t('channel.uploading', { pct: Math.round(phase.progress * 100) })}
                </p>
                <ProgressBar value={phase.progress} />
              </Card>
            )}

            {/* Результат */}
            {phase.name === 'done' && (
              <div className="mt-4">
                {phase.result.status === 'pending' ? (
                  <Alert tone="warn">{t('channel.donePending')}</Alert>
                ) : (
                  <Alert tone="ok">
                    {t('channel.doneApproved', {
                      pos: phase.result.queuePosition,
                      dur: formatDuration(phase.result.durationMs, t),
                    })}
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
